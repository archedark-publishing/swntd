import { describe, expect, it } from "vitest";
import { workspaceMessage } from "./index";

describe("shared workspace message", () => {
  it("describes the phase 0 foundation", () => {
    expect(workspaceMessage).toContain("foundations are ready");
  });
});
