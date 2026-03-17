import { describe, expect, it } from "vitest";
import { createApiBanner } from "./index";

describe("api bootstrap", () => {
  it("creates the placeholder banner", () => {
    expect(createApiBanner()).toContain("API bootstrap ready");
    expect(createApiBanner()).toContain("local_dev");
  });
});
