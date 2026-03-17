import type {
  RecurringTaskTemplate,
  Task
} from "../db/schema";

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

export function createTaskFixture(
  overrides: Partial<Task> = {}
): Pick<
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
> {
  return {
    id: "task-1",
    status: "To Do",
    revision: 0,
    assigneeUserId: null,
    aiAssistanceEnabled: false,
    archivedAt: null,
    completedAt: null,
    sortKey: 1024,
    recurringTaskTemplateId: null,
    ...overrides
  };
}

export function createRecurringTaskTemplateFixture(
  overrides: Partial<RecurringTaskTemplate> = {}
): Pick<
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
> {
  return {
    id: "template-1",
    title: "Take out recycling",
    description: "Take bins to the curb.",
    defaultAssigneeUserId: null,
    aiAssistanceEnabledDefault: false,
    defaultDueTime: "08:00",
    recurrenceCadence: "weekly",
    recurrenceInterval: 1,
    nextOccurrenceOn: todayIsoDate(),
    isActive: true,
    ...overrides
  };
}
