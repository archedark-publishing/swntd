import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { users } from "@swntd/shared/server/db/schema";
import { bootstrapDatabase } from "../db/bootstrap";
import { createDatabase } from "../db/client";
import { migrateDatabase } from "../db/migrate";
import { issueServiceToken } from "./service-tokens";
import { resolveRequestActor } from "./resolve-actor";

const originalEnv = { ...process.env };

beforeEach(async () => {
  const databasePath = path.join(
    os.tmpdir(),
    `swntd-auth-${crypto.randomUUID()}.sqlite`
  );

  process.env = {
    ...originalEnv,
    SWNTD_DATABASE_URL: `file:${databasePath}`,
    SWNTD_HOUSEHOLD_NAME: "Auth Test Household",
    SWNTD_BOOTSTRAP_ADMIN_EMAILS: "admin1@example.com,admin2@example.com",
    SWNTD_SERVICE_ACTOR_NAME: "Household Assistant",
    SWNTD_SERVICE_ACTOR_KIND: "assistant"
  };

  await migrateDatabase();
  await bootstrapDatabase();
});

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("resolveRequestActor", () => {
  it("falls back to the first bootstrap admin in local_dev mode", async () => {
    process.env.SWNTD_AUTH_MODE = "local_dev";

    const actor = await resolveRequestActor();

    expect(actor?.email).toBe("admin1@example.com");
    expect(actor?.role).toBe("admin");
    expect(actor?.authStrategy).toBe("local_dev");
  });

  it("resolves a browser user in local_dev mode", async () => {
    process.env.SWNTD_AUTH_MODE = "local_dev";

    const actor = await resolveRequestActor({
      headers: {
        "x-swntd-dev-email": "admin2@example.com"
      }
    });

    expect(actor?.email).toBe("admin2@example.com");
    expect(actor?.role).toBe("admin");
    expect(actor?.authStrategy).toBe("local_dev");
  });

  it("does not trust spoofed header auth outside a trusted proxy", async () => {
    process.env.SWNTD_AUTH_MODE = "trusted_header";

    const actor = await resolveRequestActor({
      headers: {
        "x-forwarded-email": "admin1@example.com"
      },
      trustedProxy: false
    });

    expect(actor).toBeNull();
  });

  it("resolves trusted header auth for known household members only", async () => {
    process.env.SWNTD_AUTH_MODE = "trusted_header";

    const actor = await resolveRequestActor({
      headers: {
        "x-forwarded-email": "admin1@example.com"
      },
      trustedProxy: true
    });

    expect(actor?.email).toBe("admin1@example.com");
    expect(actor?.role).toBe("admin");
    expect(actor?.authStrategy).toBe("trusted_header");

    const unknown = await resolveRequestActor({
      headers: {
        "x-forwarded-email": "stranger@example.com"
      },
      trustedProxy: true
    });

    expect(unknown).toBeNull();
  });

  it("resolves service actors via bearer tokens", async () => {
    process.env.SWNTD_AUTH_MODE = "trusted_header";

    const { client, db } = await createDatabase();
    const [serviceActor] = await db
      .select({
        id: users.id,
        role: users.role
      })
      .from(users)
      .where(eq(users.serviceKind, "assistant"));

    client.close();

    const token = await issueServiceToken({
      userId: serviceActor!.id,
      name: "service-actor-token"
    });

    const actor = await resolveRequestActor({
      headers: {
        authorization: `Bearer ${token.token}`
      }
    });

    expect(actor?.role).toBe("service");
    expect(actor?.serviceKind).toBe("assistant");
    expect(actor?.authStrategy).toBe("service_token");
  });

  it("rejects invalid bearer tokens", async () => {
    const actor = await resolveRequestActor({
      headers: {
        authorization: "Bearer definitely-not-a-real-token"
      }
    });

    expect(actor).toBeNull();
  });
});
