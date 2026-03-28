import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "./app";
import { bootstrapDatabase } from "./db/bootstrap";
import { migrateDatabase } from "./db/migrate";

type BootstrapContextResponse = {
  authenticatedEmail: string | null;
  canClaimOwnership: boolean;
  claimStatus:
    | "already_member"
    | "email_not_allowed"
    | "not_authenticated"
    | "ready"
    | "setup_locked";
  householdName: string;
};

type ClaimResponse = {
  actor: {
    authStrategy: "trusted_header";
    email: string;
    role: "admin";
  };
};

const originalEnv = { ...process.env };

function trustedHeader(email: string) {
  return {
    [process.env.SWNTD_TRUSTED_EMAIL_HEADER ?? "x-forwarded-email"]: email
  };
}

async function parseJson<T>(response: Response) {
  return (await response.json()) as T;
}

describe("bootstrap ownership claim", () => {
  beforeEach(async () => {
    const databasePath = path.join(
      os.tmpdir(),
      `swntd-bootstrap-auth-${crypto.randomUUID()}.sqlite`
    );

    process.env = {
      ...originalEnv,
      SWNTD_AUTH_MODE: "trusted_header",
      SWNTD_BOOTSTRAP_ADMIN_EMAILS: "owner@bootstrap.invalid",
      SWNTD_BOOTSTRAP_OWNER_EMAILS: "owner@example.com",
      SWNTD_DATABASE_URL: `file:${databasePath}`,
      SWNTD_HOUSEHOLD_NAME: "Bootstrap Household",
      SWNTD_SERVICE_ACTOR_KIND: "assistant",
      SWNTD_SERVICE_ACTOR_NAME: "Household Assistant"
    };

    await migrateDatabase();
    await bootstrapDatabase();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("describes the unauthenticated bootstrap state", async () => {
    const app = createApp();
    const response = await app.request("/api/v1/bootstrap/context");

    expect(response.status).toBe(200);
    expect(await parseJson<BootstrapContextResponse>(response)).toEqual({
      authenticatedEmail: null,
      canClaimOwnership: false,
      claimStatus: "not_authenticated",
      householdName: "Bootstrap Household"
    });
  });

  it("allows an approved owner email to claim the household once", async () => {
    const app = createApp();

    const initialContext = await app.request("/api/v1/bootstrap/context", {
      headers: trustedHeader("owner@example.com")
    });
    expect(initialContext.status).toBe(200);
    expect(await parseJson<BootstrapContextResponse>(initialContext)).toEqual({
      authenticatedEmail: "owner@example.com",
      canClaimOwnership: true,
      claimStatus: "ready",
      householdName: "Bootstrap Household"
    });

    const claimResponse = await app.request("/api/v1/bootstrap/claim", {
      headers: trustedHeader("owner@example.com"),
      method: "POST"
    });
    expect(claimResponse.status).toBe(201);
    expect(await parseJson<ClaimResponse>(claimResponse)).toMatchObject({
      actor: {
        authStrategy: "trusted_header",
        email: "owner@example.com",
        role: "admin"
      }
    });

    const meResponse = await app.request("/api/v1/me", {
      headers: trustedHeader("owner@example.com")
    });
    expect(meResponse.status).toBe(200);

    const secondContext = await app.request("/api/v1/bootstrap/context", {
      headers: trustedHeader("owner2@example.com")
    });
    expect(secondContext.status).toBe(200);
    expect(await parseJson<BootstrapContextResponse>(secondContext)).toEqual({
      authenticatedEmail: "owner2@example.com",
      canClaimOwnership: false,
      claimStatus: "setup_locked",
      householdName: "Bootstrap Household"
    });
  });

  it("blocks unapproved emails from claiming ownership", async () => {
    const app = createApp();

    const contextResponse = await app.request("/api/v1/bootstrap/context", {
      headers: trustedHeader("stranger@example.com")
    });
    expect(contextResponse.status).toBe(200);
    expect(await parseJson<BootstrapContextResponse>(contextResponse)).toEqual({
      authenticatedEmail: "stranger@example.com",
      canClaimOwnership: false,
      claimStatus: "email_not_allowed",
      householdName: "Bootstrap Household"
    });

    const claimResponse = await app.request("/api/v1/bootstrap/claim", {
      headers: trustedHeader("stranger@example.com"),
      method: "POST"
    });
    expect(claimResponse.status).toBe(403);
  });
});
