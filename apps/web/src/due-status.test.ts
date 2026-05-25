import { describe, expect, it } from "vitest";
import { getTaskDueState } from "./due-status";

describe("getTaskDueState", () => {
  it("returns none when a task has no due date", () => {
    expect(
      getTaskDueState({ dueOn: null }, 3, new Date("2026-04-23T12:00:00"))
    ).toBe("none");
  });

  it("returns near when an all-day task falls within the threshold", () => {
    expect(
      getTaskDueState(
        { dueOn: "2026-04-25", dueTime: null },
        3,
        new Date("2026-04-23T12:00:00")
      )
    ).toBe("near");
  });

  it("returns normal when a task is outside the threshold", () => {
    expect(
      getTaskDueState(
        { dueOn: "2026-04-30", dueTime: null },
        3,
        new Date("2026-04-23T12:00:00")
      )
    ).toBe("normal");
  });

  it("returns past for timed tasks after the due time passes", () => {
    expect(
      getTaskDueState(
        { dueOn: "2026-04-23", dueTime: "09:00" },
        3,
        new Date("2026-04-23T09:30:00")
      )
    ).toBe("past");
  });

  it("does not mark all-day tasks past due until the day ends", () => {
    expect(
      getTaskDueState(
        { dueOn: "2026-04-23", dueTime: null },
        3,
        new Date("2026-04-23T20:00:00")
      )
    ).toBe("near");
  });

  it("ignores archived tasks", () => {
    expect(
      getTaskDueState(
        { archivedAt: "2026-04-23T20:00:00Z", dueOn: "2026-04-20", dueTime: null },
        3,
        new Date("2026-04-24T12:00:00")
      )
    ).toBe("none");
  });
});
