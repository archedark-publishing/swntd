import {
  and,
  count,
  eq,
  inArray,
  isNotNull,
  isNull,
  like,
  or,
  type SQL
} from "drizzle-orm";
import type { AuthenticatedActor } from "@swntd/shared/server/domain/authorization";
import {
  canAssignTasks,
  canAttachExternalLink,
  canCreateTask,
  canDownloadAttachment,
  canManageSettings,
  canReadTask,
  canTransitionTask,
  canUploadBinaryAttachment
} from "@swntd/shared/server/domain/authorization";
import {
  attachments,
  checklistItems,
  comments,
  householdSettings,
  labels,
  recurringTaskTemplateChecklistItems,
  recurringTaskTemplateLabels,
  recurringTaskTemplates,
  taskEvents,
  taskLabels,
  tasks,
  type Task,
  users
} from "@swntd/shared/server/db/schema";
import {
  assertExpectedRevision,
  getTopInsertSortKey,
  recalculateSortKeys,
  reorderIds,
  taskStatuses,
  type TaskStatus,
  transitionTaskStatus
} from "@swntd/shared/server/domain/tasks";
import type { DatabaseClient } from "../db/client";
import { ApiError } from "../http/errors";

export type UserRef = {
  displayName: string;
  email: string | null;
  id: string;
  role: "admin" | "service";
  serviceKind: string | null;
};

export type LabelDto = {
  color: string | null;
  createdAt: Date;
  id: string;
  name: string;
  updatedAt: Date;
};

export type ChecklistItemDto = {
  body: string;
  createdAt: Date;
  id: string;
  isCompleted: boolean;
  sortOrder: number;
  updatedAt: Date;
};

export type CommentDto = {
  author: UserRef;
  body: string;
  createdAt: Date;
  id: string;
  updatedAt: Date;
};

export type AttachmentDto = {
  byteSize: number | null;
  createdAt: Date;
  downloadUrl: string | null;
  externalUrl: string | null;
  id: string;
  mimeType: string | null;
  originalName: string;
  storageKind: "upload" | "external_link";
  uploadedBy: UserRef;
};

export type TaskListItemDto = Omit<Task, "assigneeUserId"> & {
  assignee: UserRef | null;
  attachmentCount: number;
  checklistItems: ChecklistItemDto[];
  checklistProgress: {
    completed: number;
    total: number;
  };
  commentCount: number;
  labels: LabelDto[];
};

export type TaskDetailDto = TaskListItemDto & {
  attachments: AttachmentDto[];
  comments: CommentDto[];
};

export type RecurringTemplateDto = {
  aiAssistanceEnabledDefault: boolean;
  checklistItems: Array<{
    body: string;
    createdAt: Date;
    id: string;
    sortOrder: number;
    updatedAt: Date;
  }>;
  createdAt: Date;
  defaultAssignee: UserRef | null;
  defaultDueTime: string | null;
  description: string;
  id: string;
  isActive: boolean;
  labels: LabelDto[];
  nextOccurrenceOn: string;
  recurrenceCadence: "daily" | "weekly" | "monthly";
  recurrenceInterval: number;
  title: string;
  updatedAt: Date;
};

export type TaskListFilters = {
  archived: "exclude" | "include" | "only";
  assigneeUserId?: string | undefined;
  labelId?: string | undefined;
  limit: number;
  offset: number;
  query?: string | undefined;
  recurring?: boolean | undefined;
  status?: TaskStatus | undefined;
};

export type CreateTaskInput = {
  aiAssistanceEnabled?: boolean | undefined;
  assigneeUserId?: string | null | undefined;
  checklistItems?: Array<{
    body: string;
    isCompleted?: boolean | undefined;
  }> | undefined;
  description?: string | undefined;
  dueOn?: string | null | undefined;
  dueTime?: string | null | undefined;
  labelIds?: string[] | undefined;
  title: string;
};

export type UpdateTaskInput = CreateTaskInput & {
  expectedRevision: number;
};

export type TransitionTaskInput = {
  expectedRevision: number;
  status: TaskStatus;
};

export type ReorderTaskInput = {
  expectedRevision: number;
  targetIndex: number;
};

export type CreateLabelInput = {
  color?: string | null | undefined;
  name: string;
};

export type UpdateSettingsInput = {
  defaultCalendarExportKind?: "google" | "ics" | undefined;
  defaultTimezone?: string | undefined;
  doneArchiveAfterDays?: number | undefined;
};

export type CreateRecurringTemplateInput = {
  aiAssistanceEnabledDefault?: boolean | undefined;
  checklistItems?: Array<{
    body: string;
  }> | undefined;
  defaultAssigneeUserId?: string | null | undefined;
  defaultDueTime?: string | null | undefined;
  description?: string | undefined;
  isActive?: boolean | undefined;
  labelIds?: string[] | undefined;
  nextOccurrenceOn: string;
  recurrenceCadence: "daily" | "weekly" | "monthly";
  recurrenceInterval: number;
  title: string;
};

export type UpdateRecurringTemplateInput = CreateRecurringTemplateInput;

export type AddCommentInput = {
  body: string;
};

export type AddAttachmentLinkInput = {
  name: string;
  url: string;
};

export type CreateUploadAttachmentInput = {
  byteSize: number;
  mimeType: string | null;
  originalName: string;
  storagePath: string;
};

function getRequiredRow<T>(row: T | undefined, code: string, message: string) {
  if (!row) {
    throw new ApiError(500, code, message);
  }

  return row;
}

function assertAdmin(actor: AuthenticatedActor) {
  if (!canManageSettings(actor)) {
    throw new ApiError(
      403,
      "forbidden",
      "This action requires an admin household actor."
    );
  }
}

function mapUserRef(row: {
  displayName: string;
  email: string | null;
  id: string;
  role: "admin" | "service";
  serviceKind: string | null;
}) {
  const userRef: UserRef = {
    displayName: row.displayName,
    email: row.email,
    id: row.id,
    role: row.role,
    serviceKind: row.serviceKind
  };

  return userRef;
}

async function getUserRefsById(db: DatabaseClient, userIds: string[]) {
  if (userIds.length === 0) {
    return new Map<string, UserRef>();
  }

  const rows = await db
    .select({
      displayName: users.displayName,
      email: users.email,
      id: users.id,
      role: users.role,
      serviceKind: users.serviceKind
    })
    .from(users)
    .where(inArray(users.id, [...new Set(userIds)]));

  return new Map(rows.map((row) => [row.id, mapUserRef(row)]));
}

async function assertAssigneeInHousehold(
  db: DatabaseClient,
  householdId: string,
  assigneeUserId: string | null | undefined
) {
  if (!assigneeUserId) {
    return null;
  }

  const [row] = await db
    .select({
      id: users.id
    })
    .from(users)
    .where(and(eq(users.id, assigneeUserId), eq(users.householdId, householdId)));

  if (!row) {
    throw new ApiError(400, "invalid_assignee", "Assignee must belong to the household.");
  }

  return row.id;
}

async function assertLabelIdsInHousehold(
  db: DatabaseClient,
  householdId: string,
  labelIds: string[]
) {
  if (labelIds.length === 0) {
    return [];
  }

  const rows = await db
    .select({
      id: labels.id
    })
    .from(labels)
    .where(
      and(eq(labels.householdId, householdId), inArray(labels.id, [...new Set(labelIds)]))
    );

  if (rows.length !== [...new Set(labelIds)].length) {
    throw new ApiError(400, "invalid_labels", "Labels must belong to the household.");
  }

  return rows.map((row) => row.id);
}

async function getTaskOrThrow(db: DatabaseClient, actor: AuthenticatedActor, taskId: string) {
  const [task] = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.id, taskId), eq(tasks.householdId, actor.householdId)));

  if (!task) {
    throw new ApiError(404, "task_not_found", "Task not found.");
  }

  if (!canReadTask(actor, task)) {
    throw new ApiError(403, "forbidden", "You do not have access to this task.");
  }

  return task;
}

async function getTaskOrThrowForAdmin(
  db: DatabaseClient,
  actor: AuthenticatedActor,
  taskId: string
) {
  assertAdmin(actor);

  const [task] = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.id, taskId), eq(tasks.householdId, actor.householdId)));

  if (!task) {
    throw new ApiError(404, "task_not_found", "Task not found.");
  }

  return task;
}

async function getRecurringTemplateOrThrow(
  db: DatabaseClient,
  actor: AuthenticatedActor,
  templateId: string
) {
  assertAdmin(actor);

  const [template] = await db
    .select()
    .from(recurringTaskTemplates)
    .where(
      and(
        eq(recurringTaskTemplates.id, templateId),
        eq(recurringTaskTemplates.householdId, actor.householdId)
      )
    );

  if (!template) {
    throw new ApiError(404, "recurring_template_not_found", "Recurring template not found.");
  }

  return template;
}

function buildTaskLabelsMap(taskIds: string[]) {
  return new Map(taskIds.map((taskId) => [taskId, [] as LabelDto[]]));
}

function buildTaskChecklistMap(taskIds: string[]) {
  return new Map(taskIds.map((taskId) => [taskId, [] as ChecklistItemDto[]]));
}

async function getTaskRelations(
  db: DatabaseClient,
  taskRows: Task[],
  includeDetails: boolean
) {
  const taskIds = taskRows.map((task) => task.id);

  const checklistRows = taskIds.length
    ? await db
        .select()
        .from(checklistItems)
        .where(inArray(checklistItems.taskId, taskIds))
    : [];
  const labelLinks = taskIds.length
    ? await db.select().from(taskLabels).where(inArray(taskLabels.taskId, taskIds))
    : [];
  const commentRows = taskIds.length
    ? await db.select().from(comments).where(inArray(comments.taskId, taskIds))
    : [];
  const attachmentRows = taskIds.length
    ? await db.select().from(attachments).where(inArray(attachments.taskId, taskIds))
    : [];

  const labelIds = [...new Set(labelLinks.map((row) => row.labelId))];
  const labelRows = labelIds.length
    ? await db.select().from(labels).where(inArray(labels.id, labelIds))
    : [];

  const userIds = [
    ...taskRows.map((task) => task.assigneeUserId).filter((value) => value !== null),
    ...commentRows.map((comment) => comment.authorUserId),
    ...attachmentRows.map((attachment) => attachment.uploadedByUserId)
  ];
  const userMap = await getUserRefsById(db, userIds);

  const labelById = new Map<string, LabelDto>(
    labelRows.map((row) => [
      row.id,
      {
        color: row.color,
        createdAt: row.createdAt,
        id: row.id,
        name: row.name,
        updatedAt: row.updatedAt
      }
    ])
  );
  const labelsByTaskId = buildTaskLabelsMap(taskIds);

  for (const link of labelLinks) {
    const label = labelById.get(link.labelId);

    if (label) {
      labelsByTaskId.get(link.taskId)?.push(label);
    }
  }

  const checklistByTaskId = buildTaskChecklistMap(taskIds);

  for (const item of checklistRows) {
    checklistByTaskId.get(item.taskId)?.push({
      body: item.body,
      createdAt: item.createdAt,
      id: item.id,
      isCompleted: item.isCompleted,
      sortOrder: item.sortOrder,
      updatedAt: item.updatedAt
    });
  }

  for (const items of checklistByTaskId.values()) {
    items.sort((left, right) => left.sortOrder - right.sortOrder);
  }

  const commentsByTaskId = new Map<string, CommentDto[]>(
    taskIds.map((taskId) => [taskId, []])
  );
  const attachmentsByTaskId = new Map<string, AttachmentDto[]>(
    taskIds.map((taskId) => [taskId, []])
  );

  if (includeDetails) {
    for (const row of commentRows) {
      const author = userMap.get(row.authorUserId);

      if (!author) {
        continue;
      }

      commentsByTaskId.get(row.taskId)?.push({
        author,
        body: row.body,
        createdAt: row.createdAt,
        id: row.id,
        updatedAt: row.updatedAt
      });
    }

    for (const row of attachmentRows) {
      const uploadedBy = userMap.get(row.uploadedByUserId);

      if (!uploadedBy) {
        continue;
      }

      attachmentsByTaskId.get(row.taskId)?.push({
        byteSize: row.byteSize,
        createdAt: row.createdAt,
        downloadUrl:
          row.storageKind === "upload"
            ? `/api/v1/tasks/${row.taskId}/attachments/${row.id}/download`
            : null,
        externalUrl: row.externalUrl,
        id: row.id,
        mimeType: row.mimeType,
        originalName: row.originalName,
        storageKind: row.storageKind,
        uploadedBy
      });
    }
  }

  for (const rows of commentsByTaskId.values()) {
    rows.sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime());
  }

  return {
    assigneeMap: userMap,
    attachmentsByTaskId,
    attachmentCountByTaskId: new Map(
      taskIds.map((taskId) => [
        taskId,
        attachmentRows.filter((row) => row.taskId === taskId).length
      ])
    ),
    checklistByTaskId,
    commentCountByTaskId: new Map(
      taskIds.map((taskId) => [taskId, commentRows.filter((row) => row.taskId === taskId).length])
    ),
    commentsByTaskId,
    labelsByTaskId
  };
}

function toTaskListItemDto(
  task: Task,
  relations: Awaited<ReturnType<typeof getTaskRelations>>
): TaskListItemDto {
  const checklistItemsForTask = relations.checklistByTaskId.get(task.id) ?? [];
  const checklistProgress = {
    completed: checklistItemsForTask.filter((item) => item.isCompleted).length,
    total: checklistItemsForTask.length
  };

  return {
    ...task,
    assignee: task.assigneeUserId
      ? relations.assigneeMap.get(task.assigneeUserId) ?? null
      : null,
    attachmentCount: relations.attachmentCountByTaskId.get(task.id) ?? 0,
    checklistItems: checklistItemsForTask,
    checklistProgress,
    commentCount: relations.commentCountByTaskId.get(task.id) ?? 0,
    labels: relations.labelsByTaskId.get(task.id) ?? []
  };
}

async function createTaskEventRecord(
  db: DatabaseClient,
  taskId: string,
  actorUserId: string,
  eventType: string,
  payload: unknown
) {
  await db.insert(taskEvents).values({
    actorUserId,
    eventType,
    payloadJson: JSON.stringify(payload),
    taskId
  });
}

async function getTopSortKeyForStatus(
  db: DatabaseClient,
  householdId: string,
  status: TaskStatus
) {
  const rows = await db
    .select({
      sortKey: tasks.sortKey
    })
    .from(tasks)
    .where(
      and(
        eq(tasks.householdId, householdId),
        eq(tasks.status, status),
        isNull(tasks.archivedAt)
      )
    );

  return getTopInsertSortKey(rows.map((row) => row.sortKey));
}

export async function getCurrentActor(actor: AuthenticatedActor) {
  return {
    actor
  };
}

export async function listHouseholdUsers(
  db: DatabaseClient,
  actor: AuthenticatedActor
) {
  assertAdmin(actor);

  const rows = await db
    .select({
      displayName: users.displayName,
      email: users.email,
      id: users.id,
      role: users.role,
      serviceKind: users.serviceKind
    })
    .from(users)
    .where(eq(users.householdId, actor.householdId));

  rows.sort((left, right) => left.displayName.localeCompare(right.displayName));

  return {
    items: rows.map((row) => mapUserRef(row))
  };
}

export async function listLabels(db: DatabaseClient, actor: AuthenticatedActor) {
  assertAdmin(actor);

  const rows = await db
    .select()
    .from(labels)
    .where(eq(labels.householdId, actor.householdId))
    .orderBy(labels.name);

  return {
    items: rows.map((row) => ({
      color: row.color,
      createdAt: row.createdAt,
      id: row.id,
      name: row.name,
      updatedAt: row.updatedAt
    }))
  };
}

export async function createLabel(
  db: DatabaseClient,
  actor: AuthenticatedActor,
  input: CreateLabelInput
) {
  assertAdmin(actor);

  const [existing] = await db
    .select({
      id: labels.id
    })
    .from(labels)
    .where(and(eq(labels.householdId, actor.householdId), eq(labels.name, input.name.trim())));

  if (existing) {
    throw new ApiError(409, "label_exists", "A label with that name already exists.");
  }

  const [rawCreated] = await db
    .insert(labels)
    .values({
      color: input.color ?? null,
      householdId: actor.householdId,
      name: input.name.trim()
    })
    .returning();
  const created = getRequiredRow(rawCreated, "label_create_failed", "Label creation failed.");

  return {
    item: {
      color: created.color,
      createdAt: created.createdAt,
      id: created.id,
      name: created.name,
      updatedAt: created.updatedAt
    }
  };
}

export async function getSettings(db: DatabaseClient, actor: AuthenticatedActor) {
  assertAdmin(actor);

  const [settings] = await db
    .select()
    .from(householdSettings)
    .where(eq(householdSettings.householdId, actor.householdId));

  if (!settings) {
    throw new ApiError(404, "settings_not_found", "Household settings not found.");
  }

  return {
    settings
  };
}

export async function updateSettings(
  db: DatabaseClient,
  actor: AuthenticatedActor,
  input: UpdateSettingsInput
) {
  assertAdmin(actor);

  const [current] = await db
    .select()
    .from(householdSettings)
    .where(eq(householdSettings.householdId, actor.householdId));

  if (!current) {
    throw new ApiError(404, "settings_not_found", "Household settings not found.");
  }

  const [updated] = await db
    .update(householdSettings)
    .set({
      defaultCalendarExportKind:
        input.defaultCalendarExportKind ?? current.defaultCalendarExportKind,
      defaultTimezone: input.defaultTimezone ?? current.defaultTimezone,
      doneArchiveAfterDays: input.doneArchiveAfterDays ?? current.doneArchiveAfterDays,
      updatedAt: new Date()
    })
    .where(eq(householdSettings.householdId, actor.householdId))
    .returning();

  return {
    settings: updated
  };
}

export async function listRecurringTemplates(
  db: DatabaseClient,
  actor: AuthenticatedActor
) {
  assertAdmin(actor);

  const rows = await db
    .select()
    .from(recurringTaskTemplates)
    .where(eq(recurringTaskTemplates.householdId, actor.householdId))
    .orderBy(recurringTaskTemplates.nextOccurrenceOn, recurringTaskTemplates.title);

  const templateIds = rows.map((row) => row.id);
  const checklistRows = templateIds.length
    ? await db
        .select()
        .from(recurringTaskTemplateChecklistItems)
        .where(inArray(recurringTaskTemplateChecklistItems.recurringTaskTemplateId, templateIds))
    : [];
  const labelLinks = templateIds.length
    ? await db
        .select()
        .from(recurringTaskTemplateLabels)
        .where(inArray(recurringTaskTemplateLabels.recurringTaskTemplateId, templateIds))
    : [];
  const labelIds = [...new Set(labelLinks.map((row) => row.labelId))];
  const labelRows = labelIds.length
    ? await db.select().from(labels).where(inArray(labels.id, labelIds))
    : [];
  const assigneeIds = rows
    .map((row) => row.defaultAssigneeUserId)
    .filter((value) => value !== null);
  const assigneeMap = await getUserRefsById(db, assigneeIds);

  const labelById = new Map(labelRows.map((row) => [row.id, row]));
  const labelsByTemplateId = new Map<string, LabelDto[]>(
    templateIds.map((templateId) => [templateId, []])
  );

  for (const link of labelLinks) {
    const label = labelById.get(link.labelId);

    if (label) {
      labelsByTemplateId.get(link.recurringTaskTemplateId)?.push({
        color: label.color,
        createdAt: label.createdAt,
        id: label.id,
        name: label.name,
        updatedAt: label.updatedAt
      });
    }
  }

  const checklistByTemplateId = new Map<
    string,
    Array<{
      body: string;
      createdAt: Date;
      id: string;
      sortOrder: number;
      updatedAt: Date;
    }>
  >(templateIds.map((templateId) => [templateId, []]));

  for (const item of checklistRows) {
    checklistByTemplateId.get(item.recurringTaskTemplateId)?.push({
      body: item.body,
      createdAt: item.createdAt,
      id: item.id,
      sortOrder: item.sortOrder,
      updatedAt: item.updatedAt
    });
  }

  for (const items of checklistByTemplateId.values()) {
    items.sort((left, right) => left.sortOrder - right.sortOrder);
  }

  return {
    items: rows.map((row) => ({
      aiAssistanceEnabledDefault: row.aiAssistanceEnabledDefault,
      checklistItems: checklistByTemplateId.get(row.id) ?? [],
      createdAt: row.createdAt,
      defaultAssignee: row.defaultAssigneeUserId
        ? assigneeMap.get(row.defaultAssigneeUserId) ?? null
        : null,
      defaultDueTime: row.defaultDueTime,
      description: row.description,
      id: row.id,
      isActive: row.isActive,
      labels: labelsByTemplateId.get(row.id) ?? [],
      nextOccurrenceOn: row.nextOccurrenceOn,
      recurrenceCadence: row.recurrenceCadence,
      recurrenceInterval: row.recurrenceInterval,
      title: row.title,
      updatedAt: row.updatedAt
    }))
  };
}

export async function getRecurringTemplate(
  db: DatabaseClient,
  actor: AuthenticatedActor,
  templateId: string
) {
  const list = await listRecurringTemplates(db, actor);
  const item = list.items.find((entry) => entry.id === templateId);

  if (!item) {
    throw new ApiError(404, "recurring_template_not_found", "Recurring template not found.");
  }

  return {
    item
  };
}

export async function createRecurringTemplate(
  db: DatabaseClient,
  actor: AuthenticatedActor,
  input: CreateRecurringTemplateInput
) {
  assertAdmin(actor);

  const assigneeUserId = await assertAssigneeInHousehold(
    db,
    actor.householdId,
    input.defaultAssigneeUserId
  );
  const labelIds = await assertLabelIdsInHousehold(
    db,
    actor.householdId,
    input.labelIds ?? []
  );

  const [rawCreated] = await db
    .insert(recurringTaskTemplates)
    .values({
      aiAssistanceEnabledDefault: input.aiAssistanceEnabledDefault ?? false,
      createdByUserId: actor.id,
      defaultAssigneeUserId: assigneeUserId,
      defaultDueTime: input.defaultDueTime ?? null,
      description: input.description ?? "",
      householdId: actor.householdId,
      isActive: input.isActive ?? true,
      nextOccurrenceOn: input.nextOccurrenceOn,
      recurrenceCadence: input.recurrenceCadence,
      recurrenceInterval: input.recurrenceInterval,
      title: input.title.trim(),
      updatedByUserId: actor.id
    })
    .returning();
  const created = getRequiredRow(
    rawCreated,
    "recurring_template_create_failed",
    "Recurring template creation failed."
  );

  if (input.checklistItems?.length) {
    await db.insert(recurringTaskTemplateChecklistItems).values(
      input.checklistItems.map((item, index) => ({
        body: item.body.trim(),
        recurringTaskTemplateId: created.id,
        sortOrder: index
      }))
    );
  }

  if (labelIds.length) {
    await db.insert(recurringTaskTemplateLabels).values(
      labelIds.map((labelId) => ({
        labelId,
        recurringTaskTemplateId: created.id
      }))
    );
  }

  return getRecurringTemplate(db, actor, created.id);
}

export async function updateRecurringTemplate(
  db: DatabaseClient,
  actor: AuthenticatedActor,
  templateId: string,
  input: UpdateRecurringTemplateInput
) {
  const current = await getRecurringTemplateOrThrow(db, actor, templateId);
  const assigneeUserId = await assertAssigneeInHousehold(
    db,
    actor.householdId,
    input.defaultAssigneeUserId
  );
  const labelIds = await assertLabelIdsInHousehold(
    db,
    actor.householdId,
    input.labelIds ?? []
  );

  await db
    .update(recurringTaskTemplates)
    .set({
      aiAssistanceEnabledDefault:
        input.aiAssistanceEnabledDefault ?? current.aiAssistanceEnabledDefault,
      defaultAssigneeUserId: assigneeUserId,
      defaultDueTime: input.defaultDueTime ?? null,
      description: input.description ?? "",
      isActive: input.isActive ?? current.isActive,
      nextOccurrenceOn: input.nextOccurrenceOn,
      recurrenceCadence: input.recurrenceCadence,
      recurrenceInterval: input.recurrenceInterval,
      title: input.title.trim(),
      updatedAt: new Date(),
      updatedByUserId: actor.id
    })
    .where(eq(recurringTaskTemplates.id, templateId));

  await db
    .delete(recurringTaskTemplateChecklistItems)
    .where(eq(recurringTaskTemplateChecklistItems.recurringTaskTemplateId, templateId));
  await db
    .delete(recurringTaskTemplateLabels)
    .where(eq(recurringTaskTemplateLabels.recurringTaskTemplateId, templateId));

  if (input.checklistItems?.length) {
    await db.insert(recurringTaskTemplateChecklistItems).values(
      input.checklistItems.map((item, index) => ({
        body: item.body.trim(),
        recurringTaskTemplateId: templateId,
        sortOrder: index
      }))
    );
  }

  if (labelIds.length) {
    await db.insert(recurringTaskTemplateLabels).values(
      labelIds.map((labelId) => ({
        labelId,
        recurringTaskTemplateId: templateId
      }))
    );
  }

  return getRecurringTemplate(db, actor, templateId);
}

export async function listTasks(
  db: DatabaseClient,
  actor: AuthenticatedActor,
  filters: TaskListFilters
) {
  const conditions: SQL[] = [eq(tasks.householdId, actor.householdId)];

  if (actor.role === "service") {
    conditions.push(eq(tasks.assigneeUserId, actor.id));
    conditions.push(eq(tasks.aiAssistanceEnabled, true));
    conditions.push(isNull(tasks.archivedAt));
  } else {
    if (filters.assigneeUserId) {
      conditions.push(eq(tasks.assigneeUserId, filters.assigneeUserId));
    }

    switch (filters.archived) {
      case "exclude":
        conditions.push(isNull(tasks.archivedAt));
        break;
      case "only":
        conditions.push(isNotNull(tasks.archivedAt));
        break;
      default:
        break;
    }
  }

  if (filters.status) {
    conditions.push(eq(tasks.status, filters.status));
  }

  if (filters.recurring === true) {
    conditions.push(isNotNull(tasks.recurringTaskTemplateId));
  }

  if (filters.recurring === false) {
    conditions.push(isNull(tasks.recurringTaskTemplateId));
  }

  if (filters.query) {
    const query = `%${filters.query}%`;
    conditions.push(or(like(tasks.title, query), like(tasks.description, query))!);
  }

  if (filters.labelId) {
    const rows = await db
      .select({
        taskId: taskLabels.taskId
      })
      .from(taskLabels)
      .where(eq(taskLabels.labelId, filters.labelId));

    const taskIds = rows.map((row) => row.taskId);

    if (taskIds.length === 0) {
      return { items: [], total: 0 };
    }

    conditions.push(inArray(tasks.id, taskIds));
  }

  const [countRow] = await db
    .select({
      count: count()
    })
    .from(tasks)
    .where(and(...conditions));

  const rows = await db
    .select()
    .from(tasks)
    .where(and(...conditions))
    .limit(filters.limit)
    .offset(filters.offset);

  rows.sort((left, right) => {
    const statusDelta =
      taskStatuses.indexOf(left.status) - taskStatuses.indexOf(right.status);

    if (statusDelta !== 0) {
      return statusDelta;
    }

    return right.sortKey - left.sortKey;
  });

  const relations = await getTaskRelations(db, rows, false);

  return {
    items: rows.map((row) => toTaskListItemDto(row, relations)),
    total: countRow?.count ?? 0
  };
}

export async function getTaskDetail(
  db: DatabaseClient,
  actor: AuthenticatedActor,
  taskId: string
) {
  const task = await getTaskOrThrow(db, actor, taskId);
  const relations = await getTaskRelations(db, [task], true);
  const item = toTaskListItemDto(task, relations);

  return {
    item: {
      ...item,
      attachments: relations.attachmentsByTaskId.get(task.id) ?? [],
      comments: relations.commentsByTaskId.get(task.id) ?? []
    } satisfies TaskDetailDto
  };
}

export async function createTask(
  db: DatabaseClient,
  actor: AuthenticatedActor,
  input: CreateTaskInput
) {
  if (!canCreateTask(actor)) {
    throw new ApiError(403, "forbidden", "Only admin actors can create tasks.");
  }

  const assigneeUserId = await assertAssigneeInHousehold(
    db,
    actor.householdId,
    input.assigneeUserId
  );

  if (assigneeUserId && !canAssignTasks(actor)) {
    throw new ApiError(403, "forbidden", "Only admin actors can assign tasks.");
  }

  const labelIds = await assertLabelIdsInHousehold(
    db,
    actor.householdId,
    input.labelIds ?? []
  );
  const sortKey = await getTopSortKeyForStatus(db, actor.householdId, "To Do");

  const [rawCreated] = await db
    .insert(tasks)
    .values({
      aiAssistanceEnabled: input.aiAssistanceEnabled ?? false,
      assigneeUserId,
      createdByUserId: actor.id,
      description: input.description ?? "",
      dueOn: input.dueOn ?? null,
      dueTime: input.dueTime ?? null,
      householdId: actor.householdId,
      sortKey,
      title: input.title.trim(),
      updatedByUserId: actor.id
    })
    .returning();
  const created = getRequiredRow(rawCreated, "task_create_failed", "Task creation failed.");

  if (input.checklistItems?.length) {
    await db.insert(checklistItems).values(
      input.checklistItems.map((item, index) => ({
        body: item.body.trim(),
        isCompleted: item.isCompleted ?? false,
        sortOrder: index,
        taskId: created.id
      }))
    );
  }

  if (labelIds.length) {
    await db.insert(taskLabels).values(
      labelIds.map((labelId) => ({
        labelId,
        taskId: created.id
      }))
    );
  }

  await createTaskEventRecord(db, created.id, actor.id, "task.created", {
    title: created.title
  });

  return getTaskDetail(db, actor, created.id);
}

export async function updateTask(
  db: DatabaseClient,
  actor: AuthenticatedActor,
  taskId: string,
  input: UpdateTaskInput
) {
  const current = await getTaskOrThrowForAdmin(db, actor, taskId);
  const assigneeUserId = await assertAssigneeInHousehold(
    db,
    actor.householdId,
    input.assigneeUserId
  );
  const labelIds = await assertLabelIdsInHousehold(
    db,
    actor.householdId,
    input.labelIds ?? []
  );
  assertExpectedRevision(current.revision, input.expectedRevision);

  await db
    .update(tasks)
    .set({
      aiAssistanceEnabled: input.aiAssistanceEnabled ?? current.aiAssistanceEnabled,
      assigneeUserId,
      description: input.description ?? "",
      dueOn: input.dueOn ?? null,
      dueTime: input.dueTime ?? null,
      revision: current.revision + 1,
      title: input.title.trim(),
      updatedAt: new Date(),
      updatedByUserId: actor.id
    })
    .where(eq(tasks.id, taskId));

  await db.delete(checklistItems).where(eq(checklistItems.taskId, taskId));
  await db.delete(taskLabels).where(eq(taskLabels.taskId, taskId));

  if (input.checklistItems?.length) {
    await db.insert(checklistItems).values(
      input.checklistItems.map((item, index) => ({
        body: item.body.trim(),
        isCompleted: item.isCompleted ?? false,
        sortOrder: index,
        taskId
      }))
    );
  }

  if (labelIds.length) {
    await db.insert(taskLabels).values(
      labelIds.map((labelId) => ({
        labelId,
        taskId
      }))
    );
  }

  await createTaskEventRecord(db, taskId, actor.id, "task.updated", {
    revision: current.revision + 1
  });

  return getTaskDetail(db, actor, taskId);
}

export async function transitionTask(
  db: DatabaseClient,
  actor: AuthenticatedActor,
  taskId: string,
  input: TransitionTaskInput
) {
  const current = await getTaskOrThrow(db, actor, taskId);

  if (!canTransitionTask(actor, current)) {
    throw new ApiError(403, "forbidden", "You cannot transition this task.");
  }

  const transitioned = transitionTaskStatus({
    expectedRevision: input.expectedRevision,
    nextStatus: input.status,
    task: current
  });
  const sortKey =
    transitioned.status === current.status
      ? current.sortKey
      : await getTopSortKeyForStatus(db, actor.householdId, transitioned.status);

  await db
    .update(tasks)
    .set({
      completedAt: transitioned.completedAt,
      revision: transitioned.revision,
      sortKey,
      status: transitioned.status,
      updatedAt: new Date(),
      updatedByUserId: actor.id
    })
    .where(eq(tasks.id, taskId));

  await createTaskEventRecord(db, taskId, actor.id, "task.status_changed", {
    nextStatus: input.status,
    revision: transitioned.revision
  });

  return getTaskDetail(db, actor, taskId);
}

export async function reorderTask(
  db: DatabaseClient,
  actor: AuthenticatedActor,
  taskId: string,
  input: ReorderTaskInput
) {
  const current = await getTaskOrThrowForAdmin(db, actor, taskId);
  assertExpectedRevision(current.revision, input.expectedRevision);

  const peers = await db
    .select()
    .from(tasks)
    .where(
      and(
        eq(tasks.householdId, actor.householdId),
        eq(tasks.status, current.status),
        isNull(tasks.archivedAt)
      )
    );

  peers.sort((left, right) => right.sortKey - left.sortKey);
  const nextOrder = reorderIds(
    peers.map((peer) => peer.id),
    taskId,
    input.targetIndex
  );
  const sortKeys = recalculateSortKeys(nextOrder);

  await Promise.all(
    peers.map((peer) =>
      db
        .update(tasks)
        .set({
          revision: peer.id === taskId ? peer.revision + 1 : peer.revision,
          sortKey: sortKeys[peer.id] ?? peer.sortKey,
          updatedAt: peer.id === taskId ? new Date() : peer.updatedAt,
          updatedByUserId: peer.id === taskId ? actor.id : peer.updatedByUserId
        })
        .where(eq(tasks.id, peer.id))
    )
  );

  await createTaskEventRecord(db, taskId, actor.id, "task.reordered", {
    targetIndex: input.targetIndex
  });

  return getTaskDetail(db, actor, taskId);
}

export async function addCommentToTask(
  db: DatabaseClient,
  actor: AuthenticatedActor,
  taskId: string,
  input: AddCommentInput
) {
  const task = await getTaskOrThrow(db, actor, taskId);

  if (!canReadTask(actor, task)) {
    throw new ApiError(403, "forbidden", "You cannot comment on this task.");
  }

  await db.insert(comments).values({
    authorUserId: actor.id,
    body: input.body.trim(),
    taskId
  });

  await createTaskEventRecord(db, taskId, actor.id, "task.comment_added", {});

  return getTaskDetail(db, actor, taskId);
}

export async function addAttachmentLinkToTask(
  db: DatabaseClient,
  actor: AuthenticatedActor,
  taskId: string,
  input: AddAttachmentLinkInput
) {
  const task = await getTaskOrThrow(db, actor, taskId);

  if (!canAttachExternalLink(actor, task)) {
    throw new ApiError(403, "forbidden", "You cannot attach links to this task.");
  }

  await db.insert(attachments).values({
    externalUrl: input.url,
    originalName: input.name.trim(),
    storageKind: "external_link",
    taskId,
    uploadedByUserId: actor.id
  });

  await createTaskEventRecord(db, taskId, actor.id, "task.attachment_linked", {
    url: input.url
  });

  return getTaskDetail(db, actor, taskId);
}

export async function addUploadToTask(
  db: DatabaseClient,
  actor: AuthenticatedActor,
  taskId: string,
  input: CreateUploadAttachmentInput
) {
  const task = await getTaskOrThrow(db, actor, taskId);

  if (!canUploadBinaryAttachment(actor)) {
    throw new ApiError(403, "forbidden", "You cannot upload files for this task.");
  }

  if (!canDownloadAttachment(actor, task)) {
    throw new ApiError(403, "forbidden", "You cannot upload files for this task.");
  }

  const [rawCreated] = await db
    .insert(attachments)
    .values({
      byteSize: input.byteSize,
      mimeType: input.mimeType,
      originalName: input.originalName,
      storageKind: "upload",
      storagePath: input.storagePath,
      taskId,
      uploadedByUserId: actor.id
    })
    .returning();
  const created = getRequiredRow(
    rawCreated,
    "attachment_create_failed",
    "Attachment creation failed."
  );

  await createTaskEventRecord(db, taskId, actor.id, "task.attachment_uploaded", {
    attachmentId: created.id,
    originalName: created.originalName
  });

  return getTaskDetail(db, actor, taskId);
}

export async function archiveTask(
  db: DatabaseClient,
  actor: AuthenticatedActor,
  taskId: string,
  expectedRevision: number
) {
  const current = await getTaskOrThrowForAdmin(db, actor, taskId);
  assertExpectedRevision(current.revision, expectedRevision);

  await db
    .update(tasks)
    .set({
      archivedAt: new Date(),
      revision: current.revision + 1,
      updatedAt: new Date(),
      updatedByUserId: actor.id
    })
    .where(eq(tasks.id, taskId));

  await createTaskEventRecord(db, taskId, actor.id, "task.archived", {
    revision: current.revision + 1
  });

  return getTaskDetail(db, actor, taskId);
}

export async function unarchiveTask(
  db: DatabaseClient,
  actor: AuthenticatedActor,
  taskId: string,
  expectedRevision: number
) {
  const current = await getTaskOrThrowForAdmin(db, actor, taskId);
  assertExpectedRevision(current.revision, expectedRevision);
  const sortKey = await getTopSortKeyForStatus(db, actor.householdId, current.status);

  await db
    .update(tasks)
    .set({
      archivedAt: null,
      revision: current.revision + 1,
      sortKey,
      updatedAt: new Date(),
      updatedByUserId: actor.id
    })
    .where(eq(tasks.id, taskId));

  await createTaskEventRecord(db, taskId, actor.id, "task.unarchived", {
    revision: current.revision + 1
  });

  return getTaskDetail(db, actor, taskId);
}

export async function getTaskAttachmentDownload(
  db: DatabaseClient,
  actor: AuthenticatedActor,
  taskId: string,
  attachmentId: string
) {
  const task = await getTaskOrThrow(db, actor, taskId);

  if (!canDownloadAttachment(actor, task)) {
    throw new ApiError(403, "forbidden", "You cannot download this attachment.");
  }

  const [attachment] = await db
    .select()
    .from(attachments)
    .where(and(eq(attachments.id, attachmentId), eq(attachments.taskId, taskId)));

  if (!attachment) {
    throw new ApiError(404, "attachment_not_found", "Attachment not found.");
  }

  if (attachment.storageKind !== "upload" || !attachment.storagePath) {
    throw new ApiError(
      400,
      "attachment_not_downloadable",
      "Only uploaded attachments can be downloaded."
    );
  }

  return {
    attachment
  };
}
