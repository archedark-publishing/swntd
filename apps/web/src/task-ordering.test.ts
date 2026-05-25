import { describe, expect, it } from "vitest";
import type { TaskListItem } from "./api";
import { applyOptimisticTaskPlacement } from "./task-ordering";

function createTask(overrides: Partial<TaskListItem>): TaskListItem {
  return {
    aiAssistanceEnabled: false,
    archivedAt: null,
    assignee: null,
    attachmentCount: 0,
    checklistItems: [],
    checklistProgress: { completed: 0, total: 0 },
    commentCount: 0,
    completedAt: null,
    createdAt: "2026-04-23T00:00:00.000Z",
    createdByUserId: "admin-1",
    description: "",
    dueOn: null,
    dueTime: null,
    householdId: "default-household",
    id: "task",
    labels: [],
    recurringTaskTemplateId: null,
    revision: 1,
    sortKey: 1024,
    status: "To Do",
    title: "Task",
    updatedAt: "2026-04-23T00:00:00.000Z",
    updatedByUserId: "admin-1",
    ...overrides
  };
}

describe("applyOptimisticTaskPlacement", () => {
  it("reorders within a column and bumps only the moved task revision", () => {
    const result = applyOptimisticTaskPlacement({
      targetIndex: 1,
      targetStatus: "To Do",
      taskId: "a",
      tasks: [
        createTask({ id: "a", revision: 4, sortKey: 3072, title: "A" }),
        createTask({ id: "b", revision: 8, sortKey: 2048, title: "B" }),
        createTask({ id: "c", revision: 3, sortKey: 1024, title: "C" })
      ]
    });

    expect(result?.tasks.filter((task) => task.status === "To Do").map((task) => task.id)).toEqual([
      "b",
      "a",
      "c"
    ]);
    expect(result?.updatedTask.revision).toBe(5);
    expect(result?.tasks.find((task) => task.id === "b")?.revision).toBe(8);
  });

  it("moves a task across columns and uses one revision bump when landing at the top", () => {
    const result = applyOptimisticTaskPlacement({
      targetIndex: 0,
      targetStatus: "In Progress",
      taskId: "a",
      tasks: [
        createTask({ id: "a", revision: 2, sortKey: 2048, title: "A" }),
        createTask({ id: "b", revision: 1, sortKey: 1024, title: "B" }),
        createTask({ id: "c", revision: 9, sortKey: 1024, status: "In Progress", title: "C" })
      ]
    });

    expect(
      result?.tasks.filter((task) => task.status === "In Progress").map((task) => task.id)
    ).toEqual(["a", "c"]);
    expect(result?.updatedTask.revision).toBe(3);
  });

  it("moves a task across columns and uses two revision bumps when reordering after transition", () => {
    const result = applyOptimisticTaskPlacement({
      targetIndex: 1,
      targetStatus: "In Progress",
      taskId: "a",
      tasks: [
        createTask({ id: "a", revision: 2, sortKey: 2048, title: "A" }),
        createTask({ id: "c", revision: 9, sortKey: 2048, status: "In Progress", title: "C" }),
        createTask({ id: "d", revision: 5, sortKey: 1024, status: "In Progress", title: "D" })
      ]
    });

    expect(
      result?.tasks.filter((task) => task.status === "In Progress").map((task) => task.id)
    ).toEqual(["c", "a", "d"]);
    expect(result?.updatedTask.revision).toBe(4);
  });
});
