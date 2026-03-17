import type {
  RecurringTaskTemplate,
  Task
} from "../db/schema";

export const taskStatuses = [
  "To Do",
  "In Progress",
  "Waiting",
  "Done"
] as const;

export type TaskStatus = (typeof taskStatuses)[number];

export class TaskDomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TaskDomainError";
  }
}

export type TaskRecordForDomain = Pick<
  Task,
  | "id"
  | "status"
  | "revision"
  | "assigneeUserId"
  | "aiAssistanceEnabled"
  | "archivedAt"
  | "completedAt"
  | "sortKey"
  | "recurringTaskTemplateId"
>;

export type RecurringTemplateForDomain = Pick<
  RecurringTaskTemplate,
  | "id"
  | "title"
  | "description"
  | "defaultAssigneeUserId"
  | "aiAssistanceEnabledDefault"
  | "defaultDueTime"
  | "recurrenceCadence"
  | "recurrenceInterval"
  | "nextOccurrenceOn"
  | "isActive"
>;

export type GeneratedOccurrence = {
  occurrence: {
    recurringTaskTemplateId: string;
    title: string;
    description: string;
    status: TaskStatus;
    assigneeUserId: string | null;
    aiAssistanceEnabled: boolean;
    dueOn: string;
    dueTime: string | null;
    sortKey: number;
  };
  nextOccurrenceOn: string;
};

export function assertExpectedRevision(
  currentRevision: number,
  expectedRevision: number
) {
  if (currentRevision !== expectedRevision) {
    throw new TaskDomainError(
      `Expected revision ${expectedRevision}, received ${currentRevision}.`
    );
  }
}

export function canServiceActorMutateTask(args: {
  actorId: string;
  task: Pick<
    TaskRecordForDomain,
    "assigneeUserId" | "aiAssistanceEnabled" | "archivedAt"
  >;
}) {
  return (
    args.task.assigneeUserId === args.actorId &&
    args.task.aiAssistanceEnabled &&
    args.task.archivedAt === null
  );
}

export function transitionTaskStatus(args: {
  task: TaskRecordForDomain;
  nextStatus: TaskStatus;
  expectedRevision: number;
  completedAt?: Date;
}) {
  const { task, nextStatus, expectedRevision } = args;

  assertExpectedRevision(task.revision, expectedRevision);

  if (task.archivedAt) {
    throw new TaskDomainError("Archived tasks cannot change status.");
  }

  if (task.status === nextStatus) {
    return task;
  }

  return {
    ...task,
    status: nextStatus,
    revision: task.revision + 1,
    completedAt:
      nextStatus === "Done" ? (args.completedAt ?? new Date()) : null
  };
}

export function getTopInsertSortKey(existingSortKeys: number[]) {
  if (existingSortKeys.length === 0) {
    return 1024;
  }

  return Math.max(...existingSortKeys) + 1024;
}

export function reorderIds(
  idsInCurrentOrder: string[],
  movedId: string,
  targetIndex: number
) {
  const filtered = idsInCurrentOrder.filter((id) => id !== movedId);
  const safeTargetIndex = Math.max(0, Math.min(targetIndex, filtered.length));

  filtered.splice(safeTargetIndex, 0, movedId);

  return filtered;
}

export function recalculateSortKeys(idsInOrder: string[]) {
  const step = 1024;
  const highest = idsInOrder.length * step;

  return Object.fromEntries(
    idsInOrder.map((id, index) => [id, highest - index * step])
  );
}

export function getAutoArchiveAt(args: {
  completedAt: Date | null;
  retentionDays: number;
  isRecurringOccurrence: boolean;
  successorGeneratedAt: Date | null;
}) {
  if (args.isRecurringOccurrence) {
    return args.successorGeneratedAt;
  }

  if (!args.completedAt) {
    return null;
  }

  return addDays(args.completedAt, args.retentionDays);
}

export function shouldArchiveTask(args: {
  completedAt: Date | null;
  retentionDays: number;
  isRecurringOccurrence: boolean;
  successorGeneratedAt: Date | null;
  now: Date;
}) {
  const archiveAt = getAutoArchiveAt(args);

  return archiveAt !== null && archiveAt.getTime() <= args.now.getTime();
}

export function computeNextOccurrenceOn(args: {
  fromOn: string;
  cadence: RecurringTemplateForDomain["recurrenceCadence"];
  interval: number;
}) {
  const base = new Date(`${args.fromOn}T00:00:00.000Z`);

  switch (args.cadence) {
    case "daily":
      return toIsoDate(addDays(base, args.interval));
    case "weekly":
      return toIsoDate(addDays(base, args.interval * 7));
    case "monthly":
      return toIsoDate(addMonths(base, args.interval));
    default:
      throw new TaskDomainError("Unsupported recurrence cadence.");
  }
}

export function shouldGenerateOccurrence(args: {
  template: RecurringTemplateForDomain;
  latestOccurrence:
    | Pick<TaskRecordForDomain, "completedAt" | "archivedAt">
    | null;
  nowOn: string;
}) {
  if (!args.template.isActive) {
    return false;
  }

  if (args.template.nextOccurrenceOn > args.nowOn) {
    return false;
  }

  if (!args.latestOccurrence) {
    return true;
  }

  return args.latestOccurrence.completedAt !== null;
}

export function buildNextOccurrence(args: {
  template: RecurringTemplateForDomain;
  sortKey: number;
}): GeneratedOccurrence {
  return {
    occurrence: {
      recurringTaskTemplateId: args.template.id,
      title: args.template.title,
      description: args.template.description,
      status: "To Do",
      assigneeUserId: args.template.defaultAssigneeUserId,
      aiAssistanceEnabled: args.template.aiAssistanceEnabledDefault,
      dueOn: args.template.nextOccurrenceOn,
      dueTime: args.template.defaultDueTime,
      sortKey: args.sortKey
    },
    nextOccurrenceOn: computeNextOccurrenceOn({
      fromOn: args.template.nextOccurrenceOn,
      cadence: args.template.recurrenceCadence,
      interval: args.template.recurrenceInterval
    })
  };
}

function addDays(date: Date, amount: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + amount);
  return next;
}

function addMonths(date: Date, amount: number) {
  const next = new Date(date);
  next.setUTCMonth(next.getUTCMonth() + amount);
  return next;
}

function toIsoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}
