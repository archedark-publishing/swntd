import { describe, expect, it } from "vitest";
import { createMcpBanner } from "./index";

describe("mcp bootstrap", () => {
  it("creates the placeholder banner", () => {
    expect(createMcpBanner()).toContain("MCP bootstrap ready");
  });
});
