import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { bootstrapDatabase } from "./bootstrap";
import { migrateDatabase } from "./migrate";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
  vi.restoreAllMocks();
});

describe("bootstrapDatabase", () => {
  it("seeds a generic household, admins, and service actor idempotently", async () => {
    const databasePath = path.join(
      os.tmpdir(),
      `swntd-phase1-${crypto.randomUUID()}.sqlite`
    );

    process.env.SWNTD_DATABASE_URL = `file:${databasePath}`;
    process.env.SWNTD_HOUSEHOLD_NAME = "Test Household";
    process.env.SWNTD_BOOTSTRAP_ADMIN_EMAILS =
      "admin1@example.com,admin2@example.com";
    process.env.SWNTD_SERVICE_ACTOR_NAME = "Household Assistant";
    process.env.SWNTD_SERVICE_ACTOR_KIND = "assistant";

    await migrateDatabase();

    const first = await bootstrapDatabase();
    const second = await bootstrapDatabase();

    expect(first.householdName).toBe("Test Household");
    expect(first.seededUsers).toHaveLength(3);
    expect(first.seededTemplates).toHaveLength(1);
    expect(first.seededPeriods).toHaveLength(1);
    expect(second.seededUsers).toHaveLength(3);
    expect(second.seededTemplates).toHaveLength(1);
    expect(second.seededPeriods).toHaveLength(1);
    expect(second.seededPeriods[0]?.status).toBe("active");
    expect(second.seededPeriods[0]?.closureOn).toBe(
      new Date().toISOString().slice(0, 10)
    );
    expect(
      second.seededUsers.filter((user) => user.role === "admin").map((user) => user.email)
    ).toEqual(["admin1@example.com", "admin2@example.com"]);
  });
});
