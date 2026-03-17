import { describe, expect, it } from "vitest";
import { parseSwntdConfig } from "./config";

describe("parseSwntdConfig", () => {
  it("normalizes bootstrap emails and preserves generic service actor config", () => {
    const config = parseSwntdConfig({
      SWNTD_BOOTSTRAP_ADMIN_EMAILS: "Admin1@example.com, ADMIN2@example.com "
    });

    expect(config.bootstrapAdminEmails).toEqual([
      "admin1@example.com",
      "admin2@example.com"
    ]);
    expect(config.serviceActorName).toBe("Household Assistant");
    expect(config.maxUploadBytes).toBe(20 * 1024 * 1024);
  });
});
