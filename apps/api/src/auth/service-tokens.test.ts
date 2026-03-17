import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { users } from "@swntd/shared/server/db/schema";
import { bootstrapDatabase } from "../db/bootstrap";
import { createDatabase } from "../db/client";
import { migrateDatabase } from "../db/migrate";
import { issueServiceToken } from "./service-tokens";

const originalEnv = { ...process.env };

beforeEach(async () => {
  const databasePath = path.join(
    os.tmpdir(),
    `swntd-service-tokens-${crypto.randomUUID()}.sqlite`
  );

  process.env = {
    ...originalEnv,
    SWNTD_DATABASE_URL: `file:${databasePath}`,
    SWNTD_HOUSEHOLD_NAME: "Service Token Test Household",
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

describe("issueServiceToken", () => {
  it("rejects non-service users", async () => {
    const { client, db } = await createDatabase();
    const [adminUser] = await db
      .select({
        id: users.id
      })
      .from(users)
      .where(eq(users.email, "admin1@example.com"));

    client.close();

    await expect(
      issueServiceToken({
        userId: adminUser!.id,
        name: "should-fail"
      })
    ).rejects.toThrow("Service tokens can only be issued for service actors.");
  });
});
