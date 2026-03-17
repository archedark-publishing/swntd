import { describe, expect, it } from "vitest";
import {
  buildNextOccurrence,
  canServiceActorMutateTask,
  computeNextOccurrenceOn,
  getAutoArchiveAt,
  getTopInsertSortKey,
  recalculateSortKeys,
  reorderIds,
  shouldArchiveTask,
  shouldGenerateOccurrence,
  TaskDomainError,
  transitionTaskStatus
} from "./tasks";
import {
  createRecurringTaskTemplateFixture,
  createTaskFixture
} from "./fixtures";

describe("task domain rules", () => {
  it("allows service actors to mutate only assigned AI-enabled tasks", () => {
    const task = createTaskFixture({
      assigneeUserId: "service-1",
      aiAssistanceEnabled: true
    });

    expect(canServiceActorMutateTask({ actorId: "service-1", task })).toBe(true);
    expect(canServiceActorMutateTask({ actorId: "service-2", task })).toBe(
      false
    );
  });

  it("rejects stale revisions during status transitions", () => {
    const task = createTaskFixture({ revision: 4 });

    expect(() =>
      transitionTaskStatus({
        task,
        nextStatus: "In Progress",
        expectedRevision: 3
      })
    ).toThrow(TaskDomainError);
  });

  it("increments revision and completion time when marking a task done", () => {
    const task = createTaskFixture({ revision: 1 });
    const completedAt = new Date("2026-03-17T12:00:00.000Z");

    const updated = transitionTaskStatus({
      task,
      nextStatus: "Done",
      expectedRevision: 1,
      completedAt
    });

    expect(updated.revision).toBe(2);
    expect(updated.status).toBe("Done");
    expect(updated.completedAt).toEqual(completedAt);
  });

  it("keeps task ordering stable and top-inserts new work", () => {
    expect(getTopInsertSortKey([1024, 2048, 3072])).toBe(4096);

    const reordered = reorderIds(["a", "b", "c"], "c", 0);
    expect(reordered).toEqual(["c", "a", "b"]);
    expect(recalculateSortKeys(reordered)).toEqual({
      c: 3072,
      a: 2048,
      b: 1024
    });
  });

  it("archives one-off tasks after the configured retention period", () => {
    const completedAt = new Date("2026-03-01T00:00:00.000Z");
    const archiveAt = getAutoArchiveAt({
      completedAt,
      retentionDays: 30,
      isRecurringOccurrence: false,
      successorGeneratedAt: null
    });

    expect(archiveAt?.toISOString()).toBe("2026-03-31T00:00:00.000Z");
    expect(
      shouldArchiveTask({
        completedAt,
        retentionDays: 30,
        isRecurringOccurrence: false,
        successorGeneratedAt: null,
        now: new Date("2026-04-01T00:00:00.000Z")
      })
    ).toBe(true);
  });

  it("generates recurring occurrences only when the current one is complete", () => {
    const template = createRecurringTaskTemplateFixture({
      nextOccurrenceOn: "2026-03-17",
      recurrenceCadence: "weekly"
    });

    expect(
      shouldGenerateOccurrence({
        template,
        latestOccurrence: null,
        nowOn: "2026-03-17"
      })
    ).toBe(true);

    expect(
      shouldGenerateOccurrence({
        template,
        latestOccurrence: {
          completedAt: null,
          archivedAt: null
        },
        nowOn: "2026-03-17"
      })
    ).toBe(false);
  });

  it("builds the next occurrence and advances the schedule deterministically", () => {
    const template = createRecurringTaskTemplateFixture({
      nextOccurrenceOn: "2026-03-17",
      recurrenceCadence: "monthly",
      recurrenceInterval: 1,
      aiAssistanceEnabledDefault: true,
      defaultAssigneeUserId: "service-1"
    });

    const generated = buildNextOccurrence({
      template,
      sortKey: 4096
    });

    expect(generated.occurrence.dueOn).toBe("2026-03-17");
    expect(generated.occurrence.sortKey).toBe(4096);
    expect(generated.nextOccurrenceOn).toBe(
      computeNextOccurrenceOn({
        fromOn: "2026-03-17",
        cadence: "monthly",
        interval: 1
      })
    );
  });

  it("becomes idempotent once the template schedule is advanced", () => {
    const template = createRecurringTaskTemplateFixture({
      nextOccurrenceOn: "2026-03-17",
      recurrenceCadence: "weekly"
    });

    const generated = buildNextOccurrence({
      template,
      sortKey: 1024
    });

    const advancedTemplate = {
      ...template,
      nextOccurrenceOn: generated.nextOccurrenceOn
    };

    expect(
      shouldGenerateOccurrence({
        template: advancedTemplate,
        latestOccurrence: {
          completedAt: new Date("2026-03-17T10:00:00.000Z"),
          archivedAt: null
        },
        nowOn: "2026-03-17"
      })
    ).toBe(false);
  });
});
