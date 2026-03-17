import { describe, expect, it } from "vitest";
import { createApiBanner } from "./index";

describe("api bootstrap", () => {
  it("creates the runtime banner", () => {
    expect(createApiBanner()).toContain("SWNTD API listening on");
    expect(createApiBanner()).toContain("3001");
  });
});
