import { describe, expect, it } from "vitest";
import { workspaceMessage } from "@swntd/shared";

describe("workspace bootstrap", () => {
  it("exposes a shared message", () => {
    expect(workspaceMessage).toContain("workspace");
  });
});
