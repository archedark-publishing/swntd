import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  lte,
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
  canManageRetrospectives,
  canMutateCommitment,
  canMutateRetrospectiveNote,
  canReadTask,
  canReadRetrospectiveNote,
  canRevealRetrospectiveNotes,
  canTransitionTask,
  canUploadBinaryAttachment
} from "@swntd/shared/server/domain/authorization";
import {
  attachments,
  checklistItems,
  commitmentCheckins,
  commitmentChecklistItems,
  commitmentPeriods,
  commitmentReviews,
  commitments,
  comments,
  householdSettings,
  labels,
  recurringTaskTemplateChecklistItems,
  recurringTaskTemplateLabels,
  recurringTaskTemplates,
  retrospectiveNotes,
  retrospectiveRounds,
  retrospectiveTemplateRounds,
  retrospectiveTemplates,
  retrospectives,
  serviceTokens,
  taskEvents,
  taskLabels,
  tasks,
  type Commitment,
  type CommitmentReview,
  type CommitmentPeriod,
  type Retrospective,
  type RetrospectiveNote,
  type RetrospectiveRound,
  type RetrospectiveTemplate,
  type RetrospectiveTemplateRound,
  type Task,
  users
} from "@swntd/shared/server/db/schema";
import {
  canNoteEntryPhaseAcceptWrite,
  shouldRevealNotesOnRoundEntry,
  type CommitmentTrackingInterval,
  type CommitmentTrackingKind,
  type CommitmentReviewRating,
  type RetrospectiveCadence,
  type RetrospectiveNoteWriteEntryPhase
} from "@swntd/shared/server/domain/retrospectives";
import {
  assertExpectedRevision,
  getTopInsertSortKey,
  recalculateSortKeys,
  reorderIds,
  taskStatuses,
  type TaskStatus,
  transitionTaskStatus
} from "@swntd/shared/server/domain/tasks";
import { issueServiceToken } from "../auth/service-tokens";
import type { DatabaseClient } from "../db/client";
import { DEFAULT_HOUSEHOLD_ID, toDisplayName } from "../db/bootstrap";
import { ApiError } from "../http/errors";

export type UserRef = {
  deactivatedAt: Date | null;
  displayName: string;
  email: string | null;
  id: string;
  role: "admin" | "service";
  serviceKind: string | null;
};

export type ServiceTokenDto = {
  createdAt: Date;
  expiresAt: Date | null;
  id: string;
  lastUsedAt: Date | null;
  name: string;
  revokedAt: Date | null;
  userId: string;
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
  history: Array<{ id: string; actor: UserRef | null; eventType: string; createdAt: Date }>;
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

export type RetrospectiveTemplateRoundDto = {
  configJson: string;
  createdAt: Date;
  entryPhase: "commitment_period" | "retrospective" | "both" | null;
  id: string;
  kind: "commitment_review" | "task_lookback" | "notes" | "commitment_capture";
  privacy: "shared" | "private_until_round" | "private" | null;
  prompt: string;
  sortOrder: number;
  title: string;
  updatedAt: Date;
};

export type RetrospectiveTemplateDto = {
  createdAt: Date;
  description: string;
  id: string;
  isSystem: boolean;
  name: string;
  rounds: RetrospectiveTemplateRoundDto[];
  updatedAt: Date;
};

export type CommitmentPeriodDto = CommitmentPeriod;

export type RetrospectiveRoundDto = RetrospectiveRound;

export type RetrospectiveDto = Retrospective & {
  rounds: RetrospectiveRoundDto[];
};

export type RetrospectiveNoteDto = RetrospectiveNote & {
  author: UserRef | null;
};

export type CommitmentChecklistItemDto = {
  body: string;
  createdAt: Date;
  id: string;
  isCompleted: boolean;
  sortOrder: number;
  updatedAt: Date;
};

export type CommitmentCheckinDto = {
  actor: UserRef | null;
  amount: number;
  checkinOn: string;
  createdAt: Date;
  id: string;
  note: string;
  updatedAt: Date;
};

export type CommitmentDto = Commitment & {
  assignee: UserRef | null;
  checkins: CommitmentCheckinDto[];
  checklistItems: CommitmentChecklistItemDto[];
  reviews: CommitmentReviewDto[];
};

export type CommitmentReviewDto = CommitmentReview & {
  createdBy: UserRef | null;
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

export type UpdateLabelInput = {
  color?: string | null | undefined;
  name?: string | undefined;
};

export type UpdateSettingsInput = {
  defaultCalendarExportKind?: "google" | "ics" | undefined;
  defaultRetrospectiveTemplateId?: string | null | undefined;
  defaultTimezone?: string | undefined;
  doneArchiveAfterDays?: number | undefined;
  finalizedRetrospectiveEditPolicy?: "locked" | "editable" | undefined;
  nearDueThresholdDays?: number | undefined;
  retrospectiveCadence?: RetrospectiveCadence | undefined;
  retrospectiveCadenceInterval?: number | undefined;
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

export type CreateRetrospectiveInput = {
  closureOn?: string | undefined;
  templateId?: string | undefined;
  title?: string | undefined;
};

export type UpdateRetrospectiveInput = {
  closureOn?: string | undefined;
  templateId?: string | undefined;
};

export type RetrospectiveTemplateRoundInput = {
  configJson?: string | undefined;
  entryPhase?: "commitment_period" | "retrospective" | "both" | null | undefined;
  kind: "commitment_review" | "task_lookback" | "notes" | "commitment_capture";
  privacy?: "shared" | "private_until_round" | "private" | null | undefined;
  prompt?: string | undefined;
  title: string;
};

export type CreateRetrospectiveTemplateInput = {
  description?: string | undefined;
  name: string;
  rounds: RetrospectiveTemplateRoundInput[];
};

export type UpdateRetrospectiveTemplateInput = CreateRetrospectiveTemplateInput;

export type ListRetrospectivesFilters = {
  limit: number;
  offset: number;
  status?: "draft" | "active" | "finalized" | undefined;
};

export type ListRetrospectiveNotesFilters = {
  commitmentPeriodId?: string | undefined;
  retrospectiveId?: string | undefined;
  roundId?: string | undefined;
  templateRoundId?: string | undefined;
};

export type CreateRetrospectiveNoteInput = {
  body: string;
  commitmentPeriodId: string;
  entryPhase: RetrospectiveNoteWriteEntryPhase;
  retrospectiveId?: string | null | undefined;
  roundId?: string | null | undefined;
  templateRoundId?: string | null | undefined;
};

export type UpdateRetrospectiveNoteInput = {
  body: string;
};

export type ListCommitmentFilters = {
  assigneeUserId?: string | undefined;
  commitmentPeriodId?: string | undefined;
  status?: "active" | "reviewed" | "archived" | undefined;
};

type CommitmentWriteInput = {
  checklistItems?: Array<{ body: string; isCompleted?: boolean | undefined }> | undefined;
  commitmentPeriodId?: string | null | undefined;
  createdInRetrospectiveId?: string | null | undefined;
  description?: string | undefined;
  targetCount?: number | null | undefined;
  title: string;
  trackingInterval?: CommitmentTrackingInterval | undefined;
  trackingKind: CommitmentTrackingKind;
};

export type CreateCommitmentInput = CommitmentWriteInput & {
  assigneeUserId: string;
};

export type UpdateCommitmentInput = CommitmentWriteInput & {
  assigneeUserId?: string | undefined;
  status?: "active" | "reviewed" | "archived" | undefined;
};

export type CreateCommitmentCheckinInput = {
  amount?: number | undefined;
  checkinOn: string;
  note?: string | undefined;
};

export type CreateCommitmentReviewInput = {
  note?: string | undefined;
  rating: CommitmentReviewRating;
  retrospectiveId: string;
  roundId: string;
};

export type UpdateCommitmentReviewInput = {
  note?: string | undefined;
  rating: CommitmentReviewRating;
};

export type AddCommentInput = {
  body: string;
};

export type AddAttachmentLinkInput = {
  name: string;
  url: string;
};

export type AddChecklistItemInput = {
  body: string;
  expectedRevision: number;
};

export type SetChecklistItemCompletionInput = {
  expectedRevision: number;
  isCompleted: boolean;
};

export type DeleteChecklistItemInput = {
  expectedRevision: number;
};

export type CreateUploadAttachmentInput = {
  byteSize: number;
  mimeType: string | null;
  originalName: string;
  storagePath: string;
};

export type CreateHouseholdUserInput =
  | {
      displayName: string;
      email: string;
      role: "admin";
    }
  | {
      displayName: string;
      role: "service";
      serviceKind: string;
    };

export type UpdateHouseholdUserInput = {
  displayName?: string | undefined;
  email?: string | null | undefined;
  serviceKind?: string | undefined;
};

export type IssueServiceTokenInput = {
  name: string;
};

export type TaskEventSource = "api" | "mcp";

type MutationAuditOptions = {
  eventSource?: TaskEventSource;
};

export type BootstrapClaimStatus =
  | "already_member"
  | "email_not_allowed"
  | "not_authenticated"
  | "ready"
  | "setup_locked";

export type BootstrapContextDto = {
  authenticatedEmail: string | null;
  canClaimOwnership: boolean;
  claimStatus: BootstrapClaimStatus;
  householdName: string;
};

type BootstrapConfig = {
  bootstrapAdminEmails: string[];
  bootstrapOwnerEmails: string[];
  householdName: string;
};

const BOOTSTRAP_PLACEHOLDER_EMAIL_DOMAIN = ".invalid";

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
  deactivatedAt: Date | null;
  displayName: string;
  email: string | null;
  id: string;
  role: "admin" | "service";
  serviceKind: string | null;
}) {
  const userRef: UserRef = {
    deactivatedAt: row.deactivatedAt,
    displayName: row.displayName,
    email: row.email,
    id: row.id,
    role: row.role,
    serviceKind: row.serviceKind
  };

  return userRef;
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function isBootstrapPlaceholderEmail(email: string, config: BootstrapConfig) {
  const normalizedEmail = normalizeEmail(email);

  return (
    normalizedEmail.endsWith(BOOTSTRAP_PLACEHOLDER_EMAIL_DOMAIN) &&
    config.bootstrapAdminEmails.includes(normalizedEmail)
  );
}

async function listActiveAdminUsers(db: DatabaseClient) {
  return db
    .select({
      email: users.email,
      id: users.id
    })
    .from(users)
    .where(
      and(
        eq(users.householdId, DEFAULT_HOUSEHOLD_ID),
        eq(users.role, "admin"),
        isNull(users.deactivatedAt)
      )
    );
}

async function getUserRefsById(db: DatabaseClient, userIds: string[]) {
  if (userIds.length === 0) {
    return new Map<string, UserRef>();
  }

  const rows = await db
    .select({
      deactivatedAt: users.deactivatedAt,
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
    .where(
      and(
        eq(users.id, assigneeUserId),
        eq(users.householdId, householdId),
        isNull(users.deactivatedAt)
      )
    );

  if (!row) {
    throw new ApiError(400, "invalid_assignee", "Assignee must belong to the household.");
  }

  return row.id;
}

async function assertCommitmentAssigneeInHousehold(
  db: DatabaseClient,
  householdId: string,
  assigneeUserId: string
) {
  const [row] = await db
    .select({
      id: users.id
    })
    .from(users)
    .where(
      and(
        eq(users.id, assigneeUserId),
        eq(users.householdId, householdId),
        eq(users.role, "admin"),
        isNull(users.deactivatedAt)
      )
    );

  if (!row) {
    throw new ApiError(
      400,
      "invalid_commitment_assignee",
      "Commitment assignee must be an active household admin."
    );
  }

  return row.id;
}

async function getHouseholdUserOrThrow(
  db: DatabaseClient,
  householdId: string,
  userId: string
) {
  const [row] = await db
    .select()
    .from(users)
    .where(and(eq(users.id, userId), eq(users.householdId, householdId)));

  if (!row) {
    throw new ApiError(404, "user_not_found", "Household user not found.");
  }

  return row;
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

async function getChecklistItemOrThrow(
  db: DatabaseClient,
  taskId: string,
  checklistItemId: string
) {
  const [item] = await db
    .select()
    .from(checklistItems)
    .where(and(eq(checklistItems.id, checklistItemId), eq(checklistItems.taskId, taskId)));

  if (!item) {
    throw new ApiError(404, "checklist_item_not_found", "Checklist item not found.");
  }

  return item;
}

async function resequenceChecklistItems(db: DatabaseClient, taskId: string) {
  const remainingItems = await db
    .select({
      id: checklistItems.id
    })
    .from(checklistItems)
    .where(eq(checklistItems.taskId, taskId))
    .orderBy(checklistItems.sortOrder, checklistItems.createdAt);

  await Promise.all(
    remainingItems.map((item, index) =>
      db
        .update(checklistItems)
        .set({
          sortOrder: index,
          updatedAt: new Date()
        })
        .where(eq(checklistItems.id, item.id))
    )
  );
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

function assertRetrospectiveAdmin(actor: AuthenticatedActor) {
  if (!canManageRetrospectives(actor)) {
    throw new ApiError(
      403,
      "forbidden",
      "This action requires a human household admin."
    );
  }
}

function toIsoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function todayIsoDate() {
  return toIsoDate(new Date());
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

function computeNextClosureOn(args: {
  cadence: RetrospectiveCadence;
  interval: number;
  periodStartOn: string;
}) {
  const base = new Date(`${args.periodStartOn}T00:00:00.000Z`);

  switch (args.cadence) {
    case "weekly":
      return toIsoDate(addDays(base, args.interval * 7));
    case "quarterly":
      return toIsoDate(addMonths(base, args.interval * 3));
    case "custom":
    case "monthly":
      return toIsoDate(addMonths(base, args.interval));
    default:
      return toIsoDate(addMonths(base, args.interval));
  }
}

function computePreviousPeriodStartOn(args: {
  cadence: RetrospectiveCadence;
  closureOn: string;
  interval: number;
}) {
  const base = new Date(`${args.closureOn}T00:00:00.000Z`);

  switch (args.cadence) {
    case "weekly":
      return toIsoDate(addDays(base, args.interval * -7));
    case "quarterly":
      return toIsoDate(addMonths(base, args.interval * -3));
    case "custom":
    case "monthly":
      return toIsoDate(addMonths(base, -args.interval));
    default:
      return toIsoDate(addMonths(base, -args.interval));
  }
}

function computeInitialCommitmentPeriodDates(settings?: {
  retrospectiveCadence: RetrospectiveCadence;
  retrospectiveCadenceInterval: number;
}) {
  const closureOn = todayIsoDate();
  const interval = Math.max(1, settings?.retrospectiveCadenceInterval ?? 1);
  const periodStartOn = computePreviousPeriodStartOn({
    cadence: settings?.retrospectiveCadence ?? "monthly",
    closureOn,
    interval
  });

  return { closureOn, periodStartOn };
}

async function getRetrospectiveOrThrow(
  db: DatabaseClient,
  actor: AuthenticatedActor,
  retrospectiveId: string
) {
  assertRetrospectiveAdmin(actor);

  const [retrospective] = await db
    .select()
    .from(retrospectives)
    .where(
      and(
        eq(retrospectives.id, retrospectiveId),
        eq(retrospectives.householdId, actor.householdId)
      )
    );

  if (!retrospective) {
    throw new ApiError(404, "retrospective_not_found", "Retrospective not found.");
  }

  return retrospective;
}

async function getRetrospectiveTemplateOrThrowForSettings(
  db: DatabaseClient,
  actor: AuthenticatedActor,
  templateId: string
) {
  const [template] = await db
    .select({
      id: retrospectiveTemplates.id
    })
    .from(retrospectiveTemplates)
    .where(
      and(
        eq(retrospectiveTemplates.id, templateId),
        eq(retrospectiveTemplates.householdId, actor.householdId)
      )
    );

  if (!template) {
    throw new ApiError(
      400,
      "invalid_retrospective_template",
      "Default retrospective template must belong to the household."
    );
  }

  return template;
}

async function getRetrospectiveRoundOrThrow(
  db: DatabaseClient,
  actor: AuthenticatedActor,
  retrospectiveId: string,
  roundId: string
) {
  await getRetrospectiveOrThrow(db, actor, retrospectiveId);

  const [round] = await db
    .select()
    .from(retrospectiveRounds)
    .where(
      and(
        eq(retrospectiveRounds.id, roundId),
        eq(retrospectiveRounds.retrospectiveId, retrospectiveId)
      )
    );

  if (!round) {
    throw new ApiError(
      404,
      "retrospective_round_not_found",
      "Retrospective round not found."
    );
  }

  return round;
}

async function getCommitmentPeriodOrThrow(
  db: DatabaseClient,
  actor: AuthenticatedActor,
  commitmentPeriodId: string
) {
  assertRetrospectiveAdmin(actor);

  const [period] = await db
    .select()
    .from(commitmentPeriods)
    .where(
      and(
        eq(commitmentPeriods.id, commitmentPeriodId),
        eq(commitmentPeriods.householdId, actor.householdId)
      )
    );

  if (!period) {
    throw new ApiError(
      404,
      "commitment_period_not_found",
      "Commitment period not found."
    );
  }

  return period;
}

async function getCommitmentOrThrow(
  db: DatabaseClient,
  actor: AuthenticatedActor,
  commitmentId: string
) {
  assertRetrospectiveAdmin(actor);

  const [commitment] = await db
    .select()
    .from(commitments)
    .where(
      and(
        eq(commitments.id, commitmentId),
        eq(commitments.householdId, actor.householdId)
      )
    );

  if (!commitment) {
    throw new ApiError(404, "commitment_not_found", "Commitment not found.");
  }

  return commitment;
}

function toRetrospectiveTemplateDto(
  template: RetrospectiveTemplate,
  rounds: RetrospectiveTemplateRound[]
): RetrospectiveTemplateDto {
  return {
    createdAt: template.createdAt,
    description: template.description,
    id: template.id,
    isSystem: template.isSystem,
    name: template.name,
    rounds: rounds
      .filter((round) => round.templateId === template.id)
      .sort((left, right) => left.sortOrder - right.sortOrder)
      .map((round) => ({
        configJson: round.configJson,
        createdAt: round.createdAt,
        entryPhase: round.entryPhase,
        id: round.id,
        kind: round.kind,
        privacy: round.privacy,
        prompt: round.prompt,
        sortOrder: round.sortOrder,
        title: round.title,
        updatedAt: round.updatedAt
      })),
    updatedAt: template.updatedAt
  };
}

const starterRetrospectiveRounds: RetrospectiveTemplateRoundInput[] = [
  {
    kind: "commitment_review",
    prompt: "Review how the previous period's commitments went.",
    title: "Commitments"
  },
  {
    kind: "task_lookback",
    prompt: "Look over what got done during the period.",
    title: "Lookback"
  },
  {
    entryPhase: "both",
    kind: "notes",
    privacy: "shared",
    prompt: "Talk through shared topics gathered before or during the retro.",
    title: "Topics"
  },
  {
    kind: "commitment_capture",
    prompt: "Choose commitments for the next period.",
    title: "Next commitments"
  },
  {
    entryPhase: "retrospective",
    kind: "notes",
    privacy: "shared",
    prompt: "Capture plans, scheduling notes, and next steps.",
    title: "Planning"
  },
  {
    entryPhase: "commitment_period",
    kind: "notes",
    privacy: "private_until_round",
    prompt: "Share moments worth remembering from the period.",
    title: "Highlights"
  }
];

function normalizeRetrospectiveTemplateRoundInput(
  round: RetrospectiveTemplateRoundInput,
  sortOrder: number
) {
  const configJson = round.configJson?.trim() || "{}";

  try {
    JSON.parse(configJson);
  } catch {
    throw new ApiError(
      400,
      "invalid_retrospective_round_config",
      "Round config must be valid JSON."
    );
  }

  return {
    configJson,
    entryPhase: round.kind === "notes" ? (round.entryPhase ?? "retrospective") : null,
    kind: round.kind,
    privacy: round.kind === "notes" ? (round.privacy ?? "shared") : null,
    prompt: round.prompt?.trim() ?? "",
    sortOrder,
    title: round.title.trim()
  };
}

async function ensureDefaultRetrospectiveTemplate(
  db: DatabaseClient,
  actor: AuthenticatedActor
) {
  const [settings] = await db
    .select()
    .from(householdSettings)
    .where(eq(householdSettings.householdId, actor.householdId));
  const templates = await db
    .select()
    .from(retrospectiveTemplates)
    .where(eq(retrospectiveTemplates.householdId, actor.householdId))
    .orderBy(retrospectiveTemplates.createdAt)
    .limit(1);

  if (templates[0]) {
    if (!settings?.defaultRetrospectiveTemplateId) {
      await db
        .update(householdSettings)
        .set({
          defaultRetrospectiveTemplateId: templates[0].id,
          updatedAt: new Date()
        })
        .where(eq(householdSettings.householdId, actor.householdId));
    }

    return templates[0];
  }

  const [created] = await db
    .insert(retrospectiveTemplates)
    .values({
      createdByUserId: actor.id,
      description: "A general-purpose review and planning flow.",
      householdId: actor.householdId,
      isSystem: true,
      name: "Starter retrospective",
      updatedByUserId: actor.id
    })
    .returning();
  const template = getRequiredRow(
    created,
    "retrospective_template_create_failed",
    "Retrospective template creation failed."
  );

  await db.insert(retrospectiveTemplateRounds).values(
    starterRetrospectiveRounds.map((round, index) => ({
      ...normalizeRetrospectiveTemplateRoundInput(round, index),
      templateId: template.id
    }))
  );
  await db
    .update(householdSettings)
    .set({
      defaultRetrospectiveTemplateId: template.id,
      updatedAt: new Date()
    })
    .where(eq(householdSettings.householdId, actor.householdId));

  return template;
}

async function getRetrospectiveRounds(
  db: DatabaseClient,
  retrospectiveIds: string[]
) {
  if (retrospectiveIds.length === 0) {
    return [];
  }

  return db
    .select()
    .from(retrospectiveRounds)
    .where(inArray(retrospectiveRounds.retrospectiveId, retrospectiveIds))
    .orderBy(retrospectiveRounds.sortOrder);
}

async function getVisibleRetrospectiveNotes(
  db: DatabaseClient,
  actor: AuthenticatedActor,
  filters: ListRetrospectiveNotesFilters
) {
  const conditions: SQL[] = [eq(retrospectiveNotes.householdId, actor.householdId)];

  if (filters.commitmentPeriodId) {
    conditions.push(eq(retrospectiveNotes.commitmentPeriodId, filters.commitmentPeriodId));
  }

  if (filters.retrospectiveId) {
    conditions.push(eq(retrospectiveNotes.retrospectiveId, filters.retrospectiveId));
  }

  if (filters.roundId) {
    conditions.push(eq(retrospectiveNotes.roundId, filters.roundId));
  }

  if (filters.templateRoundId) {
    conditions.push(eq(retrospectiveNotes.templateRoundId, filters.templateRoundId));
  }

  const rows = await db
    .select()
    .from(retrospectiveNotes)
    .where(and(...conditions))
    .orderBy(retrospectiveNotes.sortOrder, retrospectiveNotes.createdAt);
  const visibleRows = rows.filter((row) => canReadRetrospectiveNote(actor, row));
  const userMap = await getUserRefsById(
    db,
    visibleRows.map((row) => row.authorUserId)
  );

  return visibleRows.map((row) => ({
    ...row,
    author: userMap.get(row.authorUserId) ?? null
  }));
}

async function getCommitmentDtos(
  db: DatabaseClient,
  commitmentRows: Commitment[]
) {
  const commitmentIds = commitmentRows.map((commitment) => commitment.id);
  const checklistRows = commitmentIds.length
    ? await db
        .select()
        .from(commitmentChecklistItems)
        .where(inArray(commitmentChecklistItems.commitmentId, commitmentIds))
    : [];
  const checkinRows = commitmentIds.length
    ? await db
        .select()
        .from(commitmentCheckins)
        .where(inArray(commitmentCheckins.commitmentId, commitmentIds))
    : [];
  const reviewRows = commitmentIds.length
    ? await db
        .select()
        .from(commitmentReviews)
        .where(inArray(commitmentReviews.commitmentId, commitmentIds))
    : [];
  const userIds = [
    ...commitmentRows
      .map((commitment) => commitment.assigneeUserId)
      .filter((value) => value !== null),
    ...checkinRows.map((checkin) => checkin.actorUserId),
    ...reviewRows.map((review) => review.createdByUserId)
  ];
  const userMap = await getUserRefsById(db, userIds);

  return commitmentRows.map((commitment): CommitmentDto => {
    const checklistItemsForCommitment = checklistRows
      .filter((item) => item.commitmentId === commitment.id)
      .sort((left, right) => left.sortOrder - right.sortOrder)
      .map((item) => ({
        body: item.body,
        createdAt: item.createdAt,
        id: item.id,
        isCompleted: item.isCompleted,
        sortOrder: item.sortOrder,
        updatedAt: item.updatedAt
      }));
    const checkinsForCommitment = checkinRows
      .filter((checkin) => checkin.commitmentId === commitment.id)
      .sort((left, right) => left.checkinOn.localeCompare(right.checkinOn))
      .map((checkin) => ({
        actor: userMap.get(checkin.actorUserId) ?? null,
        amount: checkin.amount,
        checkinOn: checkin.checkinOn,
        createdAt: checkin.createdAt,
        id: checkin.id,
        note: checkin.note,
        updatedAt: checkin.updatedAt
      }));
    const reviewsForCommitment = reviewRows
      .filter((review) => review.commitmentId === commitment.id)
      .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime())
      .map((review) => ({
        ...review,
        createdBy: userMap.get(review.createdByUserId) ?? null
      }));

    return {
      ...commitment,
      assignee: commitment.assigneeUserId
        ? userMap.get(commitment.assigneeUserId) ?? null
        : null,
      checkins: checkinsForCommitment,
      checklistItems: checklistItemsForCommitment,
      reviews: reviewsForCommitment
    };
  });
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
    rows.sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());
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
  payload: unknown,
  options: MutationAuditOptions = {}
) {
  const eventSource = options.eventSource ?? "api";

  await db.insert(taskEvents).values({
    actorUserId,
    eventType,
    payloadJson: JSON.stringify({
      data: payload,
      source: eventSource
    }),
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

export async function listRetrospectiveTemplates(
  db: DatabaseClient,
  actor: AuthenticatedActor
) {
  assertRetrospectiveAdmin(actor);
  await ensureDefaultRetrospectiveTemplate(db, actor);

  const [templateRows, roundRows] = await Promise.all([
    db
      .select()
      .from(retrospectiveTemplates)
      .where(eq(retrospectiveTemplates.householdId, actor.householdId))
      .orderBy(retrospectiveTemplates.createdAt),
    db
      .select()
      .from(retrospectiveTemplateRounds)
      .innerJoin(
        retrospectiveTemplates,
        eq(retrospectiveTemplateRounds.templateId, retrospectiveTemplates.id)
      )
      .where(eq(retrospectiveTemplates.householdId, actor.householdId))
  ]);

  return {
    items: templateRows.map((template) =>
      toRetrospectiveTemplateDto(
        template,
        roundRows.map((row) => row.retrospective_template_rounds)
      )
    )
  };
}

export async function createRetrospectiveTemplate(
  db: DatabaseClient,
  actor: AuthenticatedActor,
  input: CreateRetrospectiveTemplateInput
) {
  assertRetrospectiveAdmin(actor);

  const createdId = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(retrospectiveTemplates)
      .values({
        createdByUserId: actor.id,
        description: input.description?.trim() ?? "",
        householdId: actor.householdId,
        isSystem: false,
        name: input.name.trim(),
        updatedByUserId: actor.id
      })
      .returning();
    const template = getRequiredRow(
      created,
      "retrospective_template_create_failed",
      "Retrospective template creation failed."
    );

    await tx.insert(retrospectiveTemplateRounds).values(
      input.rounds.map((round, index) => ({
        ...normalizeRetrospectiveTemplateRoundInput(round, index),
        templateId: template.id
      }))
    );

    const [settings] = await tx
      .select({
        defaultRetrospectiveTemplateId:
          householdSettings.defaultRetrospectiveTemplateId
      })
      .from(householdSettings)
      .where(eq(householdSettings.householdId, actor.householdId));

    if (!settings?.defaultRetrospectiveTemplateId) {
      await tx
        .update(householdSettings)
        .set({
          defaultRetrospectiveTemplateId: template.id,
          updatedAt: new Date()
        })
        .where(eq(householdSettings.householdId, actor.householdId));
    }

    return template.id;
  });

  const templates = await listRetrospectiveTemplates(db, actor);
  const template = templates.items.find((item) => item.id === createdId);

  return {
    item: getRequiredRow(
      template,
      "retrospective_template_not_found",
      "Retrospective template not found."
    )
  };
}

export async function updateRetrospectiveTemplate(
  db: DatabaseClient,
  actor: AuthenticatedActor,
  templateId: string,
  input: UpdateRetrospectiveTemplateInput
) {
  assertRetrospectiveAdmin(actor);

  const [current] = await db
    .select({
      id: retrospectiveTemplates.id
    })
    .from(retrospectiveTemplates)
    .where(
      and(
        eq(retrospectiveTemplates.id, templateId),
        eq(retrospectiveTemplates.householdId, actor.householdId)
      )
    );

  if (!current) {
    throw new ApiError(
      404,
      "retrospective_template_not_found",
      "Retrospective template not found."
    );
  }

  await db.transaction(async (tx) => {
    await tx
      .update(retrospectiveTemplates)
      .set({
        description: input.description?.trim() ?? "",
        name: input.name.trim(),
        updatedAt: new Date(),
        updatedByUserId: actor.id
      })
      .where(eq(retrospectiveTemplates.id, templateId));
    await tx
      .delete(retrospectiveTemplateRounds)
      .where(eq(retrospectiveTemplateRounds.templateId, templateId));
    await tx.insert(retrospectiveTemplateRounds).values(
      input.rounds.map((round, index) => ({
        ...normalizeRetrospectiveTemplateRoundInput(round, index),
        templateId
      }))
    );
  });

  const templates = await listRetrospectiveTemplates(db, actor);
  const template = templates.items.find((item) => item.id === templateId);

  return {
    item: getRequiredRow(
      template,
      "retrospective_template_not_found",
      "Retrospective template not found."
    )
  };
}

export async function getRetrospectiveHome(
  db: DatabaseClient,
  actor: AuthenticatedActor
) {
  assertRetrospectiveAdmin(actor);

  const [settings] = await db
    .select()
    .from(householdSettings)
    .where(eq(householdSettings.householdId, actor.householdId));
  let [activePeriod] = await db
    .select()
    .from(commitmentPeriods)
    .where(
      and(
        eq(commitmentPeriods.householdId, actor.householdId),
        eq(commitmentPeriods.status, "active")
      )
    )
    .orderBy(desc(commitmentPeriods.closureOn))
    .limit(1);
  const [openRetrospective] = await db
    .select()
    .from(retrospectives)
    .where(
      and(
        eq(retrospectives.householdId, actor.householdId),
        or(eq(retrospectives.status, "draft"), eq(retrospectives.status, "active"))!
      )
    )
    .orderBy(desc(retrospectives.createdAt))
    .limit(1);

  if (!activePeriod && !openRetrospective) {
    const initialPeriod = computeInitialCommitmentPeriodDates(settings);
    const [createdPeriod] = await db
      .insert(commitmentPeriods)
      .values({
        householdId: actor.householdId,
        ...initialPeriod
      })
      .returning();

    activePeriod = createdPeriod;
  }

  const recentRetrospectives = await db
    .select()
    .from(retrospectives)
    .where(
      and(
        eq(retrospectives.householdId, actor.householdId),
        eq(retrospectives.status, "finalized")
      )
    )
    .orderBy(desc(retrospectives.finalizedAt))
    .limit(10);
  const activeCommitmentRows = activePeriod
    ? await db
        .select()
        .from(commitments)
        .where(
          and(
            eq(commitments.householdId, actor.householdId),
            eq(commitments.commitmentPeriodId, activePeriod.id),
            eq(commitments.status, "active")
          )
        )
    : [];
  const periodNotes = activePeriod
    ? await getVisibleRetrospectiveNotes(db, actor, {
        commitmentPeriodId: activePeriod.id
      })
    : [];
  const commitmentDtos = await getCommitmentDtos(db, activeCommitmentRows);
  const today = todayIsoDate();
  const daysUntilClosure = activePeriod
    ? Math.max(
        0,
        Math.ceil(
          (new Date(`${activePeriod.closureOn}T00:00:00.000Z`).getTime() -
            new Date(`${today}T00:00:00.000Z`).getTime()) /
            86_400_000
        )
      )
    : null;

  return {
    activePeriod,
    commitments: commitmentDtos,
    daysUntilClosure,
    notes: periodNotes,
    openRetrospective,
    recentRetrospectives,
    settings
  };
}

export async function listRetrospectives(
  db: DatabaseClient,
  actor: AuthenticatedActor,
  filters: ListRetrospectivesFilters
) {
  assertRetrospectiveAdmin(actor);

  const conditions: SQL[] = [eq(retrospectives.householdId, actor.householdId)];

  if (filters.status) {
    conditions.push(eq(retrospectives.status, filters.status));
  }

  const rows = await db
    .select()
    .from(retrospectives)
    .where(and(...conditions))
    .orderBy(desc(retrospectives.createdAt))
    .limit(filters.limit)
    .offset(filters.offset);
  const roundRows = await getRetrospectiveRounds(
    db,
    rows.map((row) => row.id)
  );

  return {
    items: rows.map((row) => ({
      ...row,
      rounds: roundRows.filter((round) => round.retrospectiveId === row.id)
    }))
  };
}

export async function getRetrospectiveDetail(
  db: DatabaseClient,
  actor: AuthenticatedActor,
  retrospectiveId: string
) {
  const retrospective = await getRetrospectiveOrThrow(db, actor, retrospectiveId);
  const [period] = await db
    .select()
    .from(commitmentPeriods)
    .where(eq(commitmentPeriods.id, retrospective.commitmentPeriodId));
  const rounds = await getRetrospectiveRounds(db, [retrospective.id]);
  const notes = await getVisibleRetrospectiveNotes(db, actor, {
    retrospectiveId: retrospective.id
  });
  const commitmentRows = await db
    .select()
    .from(commitments)
    .where(
      and(
        eq(commitments.householdId, actor.householdId),
        or(
          eq(commitments.commitmentPeriodId, retrospective.commitmentPeriodId),
          eq(commitments.createdInRetrospectiveId, retrospective.id)
        )!
      )
    );
  const commitmentDtos = await getCommitmentDtos(db, commitmentRows);
  const taskLookback =
    period === undefined
      ? []
      : await db
          .select()
          .from(tasks)
          .where(
            and(
              eq(tasks.householdId, actor.householdId),
              eq(tasks.status, "Done"),
              isNotNull(tasks.completedAt),
              gte(
                tasks.completedAt,
                new Date(`${period.periodStartOn}T00:00:00.000Z`)
              ),
              lte(tasks.completedAt, new Date(`${period.closureOn}T23:59:59.999Z`))
            )
          )
          .orderBy(desc(tasks.completedAt));

  return {
    item: {
      ...retrospective,
      commitments: commitmentDtos,
      notes,
      period: period ?? null,
      rounds,
      taskLookback
    }
  };
}

export async function updateRetrospective(
  db: DatabaseClient,
  actor: AuthenticatedActor,
  retrospectiveId: string,
  input: UpdateRetrospectiveInput
) {
  const retrospective = await getRetrospectiveOrThrow(db, actor, retrospectiveId);

  if (retrospective.status === "finalized") {
    throw new ApiError(
      409,
      "retrospective_finalized",
      "Finalized retrospectives cannot be updated."
    );
  }

  if (input.closureOn) {
    const nextPeriodStartOn =
      retrospective.nextCommitmentPeriodStartOn ?? todayIsoDate();

    if (input.closureOn < nextPeriodStartOn) {
      throw new ApiError(
        400,
        "retrospective_closure_on_invalid",
        "The next commitment period end date cannot be before it starts."
      );
    }
  }

  await db.transaction(async (tx) => {
    let nextCurrentRoundId = retrospective.currentRoundId;

    if (input.templateId && input.templateId !== retrospective.templateId) {
      const [template] = await tx
        .select()
        .from(retrospectiveTemplates)
        .where(
          and(
            eq(retrospectiveTemplates.id, input.templateId),
            eq(retrospectiveTemplates.householdId, actor.householdId)
          )
        );

      if (!template) {
        throw new ApiError(
          404,
          "retrospective_template_not_found",
          "Retrospective template not found."
        );
      }

      const templateRounds = await tx
        .select()
        .from(retrospectiveTemplateRounds)
        .where(eq(retrospectiveTemplateRounds.templateId, template.id))
        .orderBy(retrospectiveTemplateRounds.sortOrder);

      await tx
        .delete(retrospectiveRounds)
        .where(eq(retrospectiveRounds.retrospectiveId, retrospective.id));

      const createdRounds = templateRounds.length
        ? await tx
            .insert(retrospectiveRounds)
            .values(
              templateRounds.map((round) => ({
                configJson: round.configJson,
                entryPhase: round.entryPhase,
                kind: round.kind,
                privacy: round.privacy,
                prompt: round.prompt,
                retrospectiveId: retrospective.id,
                sortOrder: round.sortOrder,
                sourceTemplateRoundId: round.id,
                title: round.title
              }))
            )
            .returning()
        : [];
      const firstRound = createdRounds.sort(
        (left, right) => left.sortOrder - right.sortOrder
      )[0];

      nextCurrentRoundId = firstRound?.id ?? null;

      for (const round of createdRounds) {
        if (!round.sourceTemplateRoundId) {
          continue;
        }

        await tx
          .update(retrospectiveNotes)
          .set({
            retrospectiveId: retrospective.id,
            roundId: round.id,
            updatedAt: new Date()
          })
          .where(
            and(
              eq(retrospectiveNotes.commitmentPeriodId, retrospective.commitmentPeriodId),
              eq(retrospectiveNotes.templateRoundId, round.sourceTemplateRoundId)
            )
          );
      }
    }

    await tx
      .update(retrospectives)
      .set({
        currentRoundId: nextCurrentRoundId,
        nextCommitmentPeriodClosureOn:
          input.closureOn ?? retrospective.nextCommitmentPeriodClosureOn,
        templateId: input.templateId ?? retrospective.templateId,
        updatedAt: new Date(),
        updatedByUserId: actor.id
      })
      .where(eq(retrospectives.id, retrospective.id));
  });

  return getRetrospectiveDetail(db, actor, retrospective.id);
}

export async function createRetrospective(
  db: DatabaseClient,
  actor: AuthenticatedActor,
  input: CreateRetrospectiveInput
) {
  assertRetrospectiveAdmin(actor);
  await ensureDefaultRetrospectiveTemplate(db, actor);

  const retrospectiveId = await db.transaction(async (tx) => {
    const [settings] = await tx
      .select()
      .from(householdSettings)
      .where(eq(householdSettings.householdId, actor.householdId));
    const templateId =
      input.templateId ?? settings?.defaultRetrospectiveTemplateId ?? undefined;

    if (!templateId) {
      throw new ApiError(
        400,
        "missing_retrospective_template",
        "A retrospective template is required."
      );
    }

    const [template] = await tx
      .select()
      .from(retrospectiveTemplates)
      .where(
        and(
          eq(retrospectiveTemplates.id, templateId),
          eq(retrospectiveTemplates.householdId, actor.householdId)
        )
      );

    if (!template) {
      throw new ApiError(
        404,
        "retrospective_template_not_found",
        "Retrospective template not found."
      );
    }

    let [period] = await tx
      .select()
      .from(commitmentPeriods)
      .where(
        and(
          eq(commitmentPeriods.householdId, actor.householdId),
          eq(commitmentPeriods.status, "active")
        )
      )
      .orderBy(asc(commitmentPeriods.closureOn))
      .limit(1);

    if (!period) {
      const [existingOpenRetrospective] = await tx
        .select({
          id: retrospectives.id
        })
        .from(retrospectives)
        .where(
          and(
            eq(retrospectives.householdId, actor.householdId),
            or(
              eq(retrospectives.status, "draft"),
              eq(retrospectives.status, "active")
            )!
          )
        )
        .limit(1);

      if (existingOpenRetrospective) {
        throw new ApiError(
          409,
          "commitment_period_not_active",
          "No active commitment period is available for a new retrospective."
        );
      }

      const initialPeriod = computeInitialCommitmentPeriodDates(settings);
      const [createdPeriod] = await tx
        .insert(commitmentPeriods)
        .values({
          householdId: actor.householdId,
          ...initialPeriod
        })
        .returning();

      period = getRequiredRow(
        createdPeriod,
        "commitment_period_create_failed",
        "Commitment period creation failed."
      );
    }

    const today = todayIsoDate();
    const reviewedClosureOn = period.closureOn > today ? today : period.closureOn;
    const nextPeriodStartOn = today;
    const nextPeriodClosureOn =
      input.closureOn ??
      computeNextClosureOn({
        cadence: settings?.retrospectiveCadence ?? "monthly",
        interval: settings?.retrospectiveCadenceInterval ?? 1,
        periodStartOn: nextPeriodStartOn
      });

    if (
      reviewedClosureOn < period.periodStartOn ||
      reviewedClosureOn > period.closureOn ||
      nextPeriodClosureOn < nextPeriodStartOn
    ) {
      throw new ApiError(
        400,
        "retrospective_closure_on_invalid",
        "The retrospective dates are outside the allowed commitment period range."
      );
    }

    const [created] = await tx
      .insert(retrospectives)
      .values({
        commitmentPeriodId: period.id,
        createdByUserId: actor.id,
        householdId: actor.householdId,
        nextCommitmentPeriodClosureOn: nextPeriodClosureOn,
        nextCommitmentPeriodStartOn: nextPeriodStartOn,
        startedAt: new Date(),
        status: "active",
        templateId: template.id,
        title:
          input.title?.trim() ||
          `Retrospective for ${period.periodStartOn} to ${reviewedClosureOn}`,
        updatedByUserId: actor.id
      })
      .returning();
    const retrospective = getRequiredRow(
      created,
      "retrospective_create_failed",
      "Retrospective creation failed."
    );
    const templateRounds = await tx
      .select()
      .from(retrospectiveTemplateRounds)
      .where(eq(retrospectiveTemplateRounds.templateId, template.id))
      .orderBy(retrospectiveTemplateRounds.sortOrder);
    const createdRounds = templateRounds.length
      ? await tx
          .insert(retrospectiveRounds)
          .values(
            templateRounds.map((round) => ({
              configJson: round.configJson,
              entryPhase: round.entryPhase,
              kind: round.kind,
              privacy: round.privacy,
              prompt: round.prompt,
              retrospectiveId: retrospective.id,
              sortOrder: round.sortOrder,
              sourceTemplateRoundId: round.id,
              title: round.title
            }))
          )
          .returning()
      : [];
    const firstRound = createdRounds.sort(
      (left, right) => left.sortOrder - right.sortOrder
    )[0];

    await tx
      .update(retrospectives)
      .set({
        currentRoundId: firstRound?.id ?? null,
        updatedAt: new Date()
      })
      .where(eq(retrospectives.id, retrospective.id));
    await tx
      .update(commitmentPeriods)
      .set({
        closureOn: reviewedClosureOn,
        status: "closed",
        updatedAt: new Date()
      })
      .where(eq(commitmentPeriods.id, period.id));

    for (const round of createdRounds) {
      if (!round.sourceTemplateRoundId) {
        continue;
      }

      await tx
        .update(retrospectiveNotes)
        .set({
          retrospectiveId: retrospective.id,
          roundId: round.id,
          updatedAt: new Date()
        })
        .where(
          and(
            eq(retrospectiveNotes.commitmentPeriodId, period.id),
            eq(retrospectiveNotes.templateRoundId, round.sourceTemplateRoundId)
          )
        );
    }

    return retrospective.id;
  });

  return getRetrospectiveDetail(db, actor, retrospectiveId);
}

export async function startRetrospective(
  db: DatabaseClient,
  actor: AuthenticatedActor,
  retrospectiveId: string
) {
  const retrospective = await getRetrospectiveOrThrow(db, actor, retrospectiveId);

  if (retrospective.status !== "draft") {
    throw new ApiError(
      409,
      "retrospective_not_draft",
      "Only draft retrospectives can be started."
    );
  }

  await db
    .update(retrospectives)
    .set({
      startedAt: new Date(),
      status: "active",
      updatedAt: new Date(),
      updatedByUserId: actor.id
    })
    .where(eq(retrospectives.id, retrospective.id));

  return getRetrospectiveDetail(db, actor, retrospective.id);
}

export async function enterRetrospectiveRound(
  db: DatabaseClient,
  actor: AuthenticatedActor,
  retrospectiveId: string,
  roundId: string
) {
  const retrospective = await getRetrospectiveOrThrow(db, actor, retrospectiveId);
  const round = await getRetrospectiveRoundOrThrow(
    db,
    actor,
    retrospectiveId,
    roundId
  );

  if (retrospective.status === "finalized") {
    throw new ApiError(
      409,
      "retrospective_finalized",
      "Finalized retrospectives cannot change rounds."
    );
  }

  await db.transaction(async (tx) => {
    await tx
      .update(retrospectives)
      .set({
        currentRoundId: round.id,
        updatedAt: new Date(),
        updatedByUserId: actor.id
      })
      .where(eq(retrospectives.id, retrospective.id));
    await tx
      .update(retrospectiveRounds)
      .set({
        startedAt: round.startedAt ?? new Date(),
        updatedAt: new Date()
      })
      .where(eq(retrospectiveRounds.id, round.id));

    if (
      shouldRevealNotesOnRoundEntry({
        kind: round.kind,
        visibilityState: round.privacy
      })
    ) {
      if (!canRevealRetrospectiveNotes(actor)) {
        throw new ApiError(403, "forbidden", "You cannot reveal retrospective notes.");
      }

      await tx
        .update(retrospectiveNotes)
        .set({
          revealedAt: new Date(),
          revealedInRetrospectiveId: retrospective.id,
          revealedInRoundId: round.id,
          updatedAt: new Date(),
          visibilityState: "revealed"
        })
        .where(
          and(
            eq(retrospectiveNotes.commitmentPeriodId, retrospective.commitmentPeriodId),
            eq(retrospectiveNotes.roundId, round.id),
            eq(retrospectiveNotes.visibilityState, "private_until_round")
          )
        );
    }
  });

  return getRetrospectiveDetail(db, actor, retrospective.id);
}

export async function completeRetrospectiveRound(
  db: DatabaseClient,
  actor: AuthenticatedActor,
  retrospectiveId: string,
  roundId: string
) {
  const round = await getRetrospectiveRoundOrThrow(
    db,
    actor,
    retrospectiveId,
    roundId
  );
  const rounds = await getRetrospectiveRounds(db, [retrospectiveId]);
  const nextRound = rounds.find((candidate) => candidate.sortOrder > round.sortOrder);

  await db
    .update(retrospectiveRounds)
    .set({
      completedAt: new Date(),
      updatedAt: new Date()
    })
    .where(eq(retrospectiveRounds.id, round.id));

  if (nextRound) {
    return enterRetrospectiveRound(db, actor, retrospectiveId, nextRound.id);
  }

  return getRetrospectiveDetail(db, actor, retrospectiveId);
}

export async function finalizeRetrospective(
  db: DatabaseClient,
  actor: AuthenticatedActor,
  retrospectiveId: string
) {
  const retrospective = await getRetrospectiveOrThrow(db, actor, retrospectiveId);

  if (retrospective.status === "finalized") {
    throw new ApiError(
      409,
      "retrospective_already_finalized",
      "Retrospective is already finalized."
    );
  }

  await db.transaction(async (tx) => {
    const [settings] = await tx
      .select()
      .from(householdSettings)
      .where(eq(householdSettings.householdId, actor.householdId));
    const periodStartOn =
      retrospective.nextCommitmentPeriodStartOn ?? todayIsoDate();
    const closureOn =
      retrospective.nextCommitmentPeriodClosureOn ??
      computeNextClosureOn({
        cadence: settings?.retrospectiveCadence ?? "monthly",
        interval: settings?.retrospectiveCadenceInterval ?? 1,
        periodStartOn
      });
    const [nextPeriod] = await tx
      .insert(commitmentPeriods)
      .values({
        householdId: actor.householdId,
        openedByRetrospectiveId: retrospective.id,
        periodStartOn,
        closureOn
      })
      .returning();
    const createdPeriod = getRequiredRow(
      nextPeriod,
      "commitment_period_create_failed",
      "Next commitment period creation failed."
    );

    await tx
      .update(commitments)
      .set({
        commitmentPeriodId: createdPeriod.id,
        updatedAt: new Date()
      })
      .where(
        and(
          eq(commitments.householdId, actor.householdId),
          eq(commitments.createdInRetrospectiveId, retrospective.id),
          isNull(commitments.commitmentPeriodId)
        )
      );
    await tx
      .update(commitmentPeriods)
      .set({
        reviewedByRetrospectiveId: retrospective.id,
        status: "reviewed",
        updatedAt: new Date()
      })
      .where(eq(commitmentPeriods.id, retrospective.commitmentPeriodId));
    await tx
      .update(retrospectives)
      .set({
        finalizedAt: new Date(),
        status: "finalized",
        updatedAt: new Date(),
        updatedByUserId: actor.id
      })
      .where(eq(retrospectives.id, retrospective.id));
  });

  return getRetrospectiveDetail(db, actor, retrospective.id);
}

export async function listRetrospectiveNotes(
  db: DatabaseClient,
  actor: AuthenticatedActor,
  filters: ListRetrospectiveNotesFilters
) {
  assertRetrospectiveAdmin(actor);

  return {
    items: await getVisibleRetrospectiveNotes(db, actor, filters)
  };
}

export async function createRetrospectiveNote(
  db: DatabaseClient,
  actor: AuthenticatedActor,
  input: CreateRetrospectiveNoteInput
) {
  assertRetrospectiveAdmin(actor);

  const period = await getCommitmentPeriodOrThrow(
    db,
    actor,
    input.commitmentPeriodId
  );
  let configuredEntryPhase: "commitment_period" | "retrospective" | "both";
  let privacy: "shared" | "private_until_round" | "private";
  const roundId = input.roundId ?? null;
  let retrospectiveId = input.retrospectiveId ?? null;
  let templateRoundId = input.templateRoundId ?? null;
  let shouldRevealImmediately = false;

  if (roundId) {
    const [round] = await db
      .select()
      .from(retrospectiveRounds)
      .innerJoin(retrospectives, eq(retrospectiveRounds.retrospectiveId, retrospectives.id))
      .where(
        and(
          eq(retrospectiveRounds.id, roundId),
          eq(retrospectives.householdId, actor.householdId)
        )
      );

    if (!round) {
      throw new ApiError(
        404,
        "retrospective_round_not_found",
        "Retrospective round not found."
      );
    }

    configuredEntryPhase = round.retrospective_rounds.entryPhase ?? "retrospective";
    privacy = round.retrospective_rounds.privacy ?? "shared";
    retrospectiveId = round.retrospectives.id;
    templateRoundId = round.retrospective_rounds.sourceTemplateRoundId;
    shouldRevealImmediately =
      privacy === "private_until_round" &&
      round.retrospectives.currentRoundId === round.retrospective_rounds.id;
  } else if (templateRoundId) {
    const [templateRound] = await db
      .select()
      .from(retrospectiveTemplateRounds)
      .innerJoin(
        retrospectiveTemplates,
        eq(retrospectiveTemplateRounds.templateId, retrospectiveTemplates.id)
      )
      .where(
        and(
          eq(retrospectiveTemplateRounds.id, templateRoundId),
          eq(retrospectiveTemplates.householdId, actor.householdId)
        )
      );

    if (!templateRound) {
      throw new ApiError(
        404,
        "retrospective_template_round_not_found",
        "Retrospective template round not found."
      );
    }

    configuredEntryPhase =
      templateRound.retrospective_template_rounds.entryPhase ?? "commitment_period";
    privacy = templateRound.retrospective_template_rounds.privacy ?? "shared";
  } else {
    throw new ApiError(
      400,
      "missing_retrospective_note_round",
      "A template round or retrospective round is required."
    );
  }

  if (
    !canNoteEntryPhaseAcceptWrite({
      configuredEntryPhase,
      writeEntryPhase: input.entryPhase
    })
  ) {
    throw new ApiError(
      400,
      "invalid_note_entry_phase",
      "This round does not accept notes during that phase."
    );
  }

  const visibilityState =
    privacy === "private_until_round" && shouldRevealImmediately
      ? "revealed"
      : privacy;
  const [created] = await db
    .insert(retrospectiveNotes)
    .values({
      authorUserId: actor.id,
      body: input.body.trim(),
      commitmentPeriodId: period.id,
      entryPhase: input.entryPhase,
      householdId: actor.householdId,
      retrospectiveId,
      roundId,
      templateRoundId,
      visibilityState
    })
    .returning();
  const note = getRequiredRow(
    created,
    "retrospective_note_create_failed",
    "Retrospective note creation failed."
  );

  return {
    item: {
      ...note,
      author: mapUserRef({
        deactivatedAt: null,
        displayName: actor.displayName,
        email: actor.email,
        id: actor.id,
        role: actor.role,
        serviceKind: actor.serviceKind
      })
    }
  };
}

export async function updateRetrospectiveNote(
  db: DatabaseClient,
  actor: AuthenticatedActor,
  noteId: string,
  input: UpdateRetrospectiveNoteInput
) {
  assertRetrospectiveAdmin(actor);

  const [note] = await db
    .select()
    .from(retrospectiveNotes)
    .where(
      and(
        eq(retrospectiveNotes.id, noteId),
        eq(retrospectiveNotes.householdId, actor.householdId)
      )
    );

  if (!note) {
    throw new ApiError(404, "retrospective_note_not_found", "Note not found.");
  }

  if (!canMutateRetrospectiveNote(actor, note)) {
    throw new ApiError(403, "forbidden", "You cannot edit this note.");
  }

  const [updated] = await db
    .update(retrospectiveNotes)
    .set({
      body: input.body.trim(),
      updatedAt: new Date()
    })
    .where(eq(retrospectiveNotes.id, note.id))
    .returning();

  return {
    item: {
      ...getRequiredRow(updated, "retrospective_note_update_failed", "Note update failed."),
      author: mapUserRef({
        deactivatedAt: null,
        displayName: actor.displayName,
        email: actor.email,
        id: actor.id,
        role: actor.role,
        serviceKind: actor.serviceKind
      })
    }
  };
}

export async function deleteRetrospectiveNote(
  db: DatabaseClient,
  actor: AuthenticatedActor,
  noteId: string
) {
  assertRetrospectiveAdmin(actor);

  const [note] = await db
    .select()
    .from(retrospectiveNotes)
    .where(
      and(
        eq(retrospectiveNotes.id, noteId),
        eq(retrospectiveNotes.householdId, actor.householdId)
      )
    );

  if (!note) {
    throw new ApiError(404, "retrospective_note_not_found", "Note not found.");
  }

  if (!canMutateRetrospectiveNote(actor, note)) {
    throw new ApiError(403, "forbidden", "You cannot delete this note.");
  }

  const [deleted] = await db
    .delete(retrospectiveNotes)
    .where(eq(retrospectiveNotes.id, note.id))
    .returning({
      id: retrospectiveNotes.id
    });

  return {
    item: getRequiredRow(
      deleted,
      "retrospective_note_delete_failed",
      "Note deletion failed."
    )
  };
}

export async function listCommitments(
  db: DatabaseClient,
  actor: AuthenticatedActor,
  filters: ListCommitmentFilters
) {
  assertRetrospectiveAdmin(actor);

  const conditions: SQL[] = [eq(commitments.householdId, actor.householdId)];

  if (filters.assigneeUserId) {
    conditions.push(eq(commitments.assigneeUserId, filters.assigneeUserId));
  }

  if (filters.commitmentPeriodId) {
    conditions.push(eq(commitments.commitmentPeriodId, filters.commitmentPeriodId));
  }

  if (filters.status) {
    conditions.push(eq(commitments.status, filters.status));
  }

  const rows = await db.select().from(commitments).where(and(...conditions));

  return {
    items: await getCommitmentDtos(db, rows)
  };
}

export async function createCommitment(
  db: DatabaseClient,
  actor: AuthenticatedActor,
  input: CreateCommitmentInput
) {
  assertRetrospectiveAdmin(actor);

  if (input.commitmentPeriodId) {
    await getCommitmentPeriodOrThrow(db, actor, input.commitmentPeriodId);
  }

  if (input.createdInRetrospectiveId) {
    await getRetrospectiveOrThrow(db, actor, input.createdInRetrospectiveId);
  }

  const assigneeUserId = await assertCommitmentAssigneeInHousehold(
    db,
    actor.householdId,
    input.assigneeUserId
  );
  const createdId = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(commitments)
      .values({
        assigneeUserId,
        commitmentPeriodId: input.commitmentPeriodId ?? null,
        createdByUserId: actor.id,
        createdInRetrospectiveId: input.createdInRetrospectiveId ?? null,
        description: input.description ?? "",
        householdId: actor.householdId,
        targetCount: input.targetCount ?? null,
        title: input.title.trim(),
        trackingInterval: input.trackingInterval ?? "none",
        trackingKind: input.trackingKind,
        updatedByUserId: actor.id
      })
      .returning({
        id: commitments.id
      });
    const createdCommitment = getRequiredRow(
      created,
      "commitment_create_failed",
      "Commitment creation failed."
    );

    if (input.checklistItems?.length) {
      await tx.insert(commitmentChecklistItems).values(
        input.checklistItems.map((item, index) => ({
          body: item.body.trim(),
          commitmentId: createdCommitment.id,
          isCompleted: item.isCompleted ?? false,
          sortOrder: index
        }))
      );
    }

    return createdCommitment.id;
  });

  const created = await getCommitmentOrThrow(db, actor, createdId);
  const [item] = await getCommitmentDtos(db, [created]);

  return {
    item
  };
}

export async function updateCommitment(
  db: DatabaseClient,
  actor: AuthenticatedActor,
  commitmentId: string,
  input: UpdateCommitmentInput
) {
  const existing = await getCommitmentOrThrow(db, actor, commitmentId);

  if (!canMutateCommitment(actor, existing)) {
    throw new ApiError(403, "forbidden", "You cannot edit this commitment.");
  }

  const assigneeUserId = input.assigneeUserId
    ? await assertCommitmentAssigneeInHousehold(
        db,
        actor.householdId,
        input.assigneeUserId
      )
    : existing.assigneeUserId;

  await db.transaction(async (tx) => {
    await tx
      .update(commitments)
      .set({
        assigneeUserId,
        commitmentPeriodId: input.commitmentPeriodId ?? existing.commitmentPeriodId,
        createdInRetrospectiveId:
          input.createdInRetrospectiveId ?? existing.createdInRetrospectiveId,
        description: input.description ?? "",
        status: input.status ?? existing.status,
        targetCount: input.targetCount ?? null,
        title: input.title.trim(),
        trackingInterval: input.trackingInterval ?? "none",
        trackingKind: input.trackingKind,
        updatedAt: new Date(),
        updatedByUserId: actor.id
      })
      .where(eq(commitments.id, existing.id));
    await tx
      .delete(commitmentChecklistItems)
      .where(eq(commitmentChecklistItems.commitmentId, existing.id));

    if (input.checklistItems?.length) {
      await tx.insert(commitmentChecklistItems).values(
        input.checklistItems.map((item, index) => ({
          body: item.body.trim(),
          commitmentId: existing.id,
          isCompleted: item.isCompleted ?? false,
          sortOrder: index
        }))
      );
    }
  });

  const updated = await getCommitmentOrThrow(db, actor, existing.id);
  const [item] = await getCommitmentDtos(db, [updated]);

  return {
    item
  };
}

export async function createCommitmentCheckin(
  db: DatabaseClient,
  actor: AuthenticatedActor,
  commitmentId: string,
  input: CreateCommitmentCheckinInput
) {
  const commitment = await getCommitmentOrThrow(db, actor, commitmentId);

  if (!canMutateCommitment(actor, commitment)) {
    throw new ApiError(403, "forbidden", "You cannot update this commitment.");
  }

  const [created] = await db
    .insert(commitmentCheckins)
    .values({
      actorUserId: actor.id,
      amount: input.amount ?? 1,
      checkinOn: input.checkinOn,
      commitmentId: commitment.id,
      note: input.note ?? ""
    })
    .returning();

  return {
    item: getRequiredRow(
      created,
      "commitment_checkin_create_failed",
      "Commitment check-in creation failed."
    )
  };
}

export async function deleteCommitmentCheckin(
  db: DatabaseClient,
  actor: AuthenticatedActor,
  checkinId: string
) {
  assertRetrospectiveAdmin(actor);

  const [row] = await db
    .select()
    .from(commitmentCheckins)
    .innerJoin(commitments, eq(commitmentCheckins.commitmentId, commitments.id))
    .where(
      and(
        eq(commitmentCheckins.id, checkinId),
        eq(commitments.householdId, actor.householdId)
      )
    );

  if (!row) {
    throw new ApiError(
      404,
      "commitment_checkin_not_found",
      "Commitment check-in not found."
    );
  }

  if (!canMutateCommitment(actor, row.commitments)) {
    throw new ApiError(403, "forbidden", "You cannot update this commitment.");
  }

  const [deleted] = await db
    .delete(commitmentCheckins)
    .where(eq(commitmentCheckins.id, row.commitment_checkins.id))
    .returning({
      id: commitmentCheckins.id
    });

  return {
    item: getRequiredRow(
      deleted,
      "commitment_checkin_delete_failed",
      "Commitment check-in deletion failed."
    )
  };
}

export async function createCommitmentReview(
  db: DatabaseClient,
  actor: AuthenticatedActor,
  commitmentId: string,
  input: CreateCommitmentReviewInput
) {
  const commitment = await getCommitmentOrThrow(db, actor, commitmentId);
  const retrospective = await getRetrospectiveOrThrow(
    db,
    actor,
    input.retrospectiveId
  );
  const round = await getRetrospectiveRoundOrThrow(
    db,
    actor,
    retrospective.id,
    input.roundId
  );

  if (!canMutateCommitment(actor, commitment)) {
    throw new ApiError(403, "forbidden", "You cannot review this commitment.");
  }

  if (round.kind !== "commitment_review") {
    throw new ApiError(
      400,
      "invalid_commitment_review_round",
      "Commitment reviews must be captured in a commitment review round."
    );
  }

  const [existingReview] = await db
    .select()
    .from(commitmentReviews)
    .where(
      and(
        eq(commitmentReviews.commitmentId, commitment.id),
        eq(commitmentReviews.retrospectiveId, retrospective.id)
      )
    );
  const [reviewRow] = existingReview
    ? await db
        .update(commitmentReviews)
        .set({
          note: input.note ?? existingReview.note,
          rating: input.rating,
          roundId: round.id,
          updatedAt: new Date(),
          updatedByUserId: actor.id
        })
        .where(eq(commitmentReviews.id, existingReview.id))
        .returning()
    : await db
        .insert(commitmentReviews)
        .values({
          commitmentId: commitment.id,
          createdByUserId: actor.id,
          note: input.note ?? "",
          rating: input.rating,
          retrospectiveId: retrospective.id,
          roundId: round.id,
          updatedByUserId: actor.id
        })
        .returning();
  const review = getRequiredRow(
    reviewRow,
    existingReview ? "commitment_review_update_failed" : "commitment_review_create_failed",
    existingReview
      ? "Commitment review update failed."
      : "Commitment review creation failed."
  );

  await db
    .update(commitments)
    .set({
      status: "reviewed",
      updatedAt: new Date(),
      updatedByUserId: actor.id
    })
    .where(eq(commitments.id, commitment.id));

  return {
    item: {
      ...review,
      createdBy: mapUserRef({
        deactivatedAt: null,
        displayName: actor.displayName,
        email: actor.email,
        id: actor.id,
        role: actor.role,
        serviceKind: actor.serviceKind
      })
    }
  };
}

export async function updateCommitmentReview(
  db: DatabaseClient,
  actor: AuthenticatedActor,
  reviewId: string,
  input: UpdateCommitmentReviewInput
) {
  assertRetrospectiveAdmin(actor);

  const [review] = await db
    .select()
    .from(commitmentReviews)
    .innerJoin(commitments, eq(commitmentReviews.commitmentId, commitments.id))
    .where(
      and(
        eq(commitmentReviews.id, reviewId),
        eq(commitments.householdId, actor.householdId)
      )
    );

  if (!review) {
    throw new ApiError(
      404,
      "commitment_review_not_found",
      "Commitment review not found."
    );
  }

  if (!canMutateCommitment(actor, review.commitments)) {
    throw new ApiError(403, "forbidden", "You cannot update this commitment review.");
  }

  const [updated] = await db
    .update(commitmentReviews)
    .set({
      note: input.note ?? "",
      rating: input.rating,
      updatedAt: new Date(),
      updatedByUserId: actor.id
    })
    .where(eq(commitmentReviews.id, review.commitment_reviews.id))
    .returning();

  return {
    item: {
      ...getRequiredRow(
        updated,
        "commitment_review_update_failed",
        "Commitment review update failed."
      ),
      createdBy: null
    }
  };
}

export async function listHouseholdUsers(
  db: DatabaseClient,
  actor: AuthenticatedActor
) {
  assertAdmin(actor);

  const rows = await db
    .select({
      deactivatedAt: users.deactivatedAt,
      displayName: users.displayName,
      email: users.email,
      id: users.id,
      role: users.role,
      serviceKind: users.serviceKind
    })
    .from(users)
    .where(and(eq(users.householdId, actor.householdId), isNull(users.deactivatedAt)));

  rows.sort((left, right) => left.displayName.localeCompare(right.displayName));

  return {
    items: rows.map((row) => mapUserRef(row))
  };
}

export async function getBootstrapContext(
  db: DatabaseClient,
  config: BootstrapConfig,
  authenticatedEmail: string | null
) {
  const normalizedEmail = authenticatedEmail ? normalizeEmail(authenticatedEmail) : null;
  const activeAdmins = await listActiveAdminUsers(db);
  const hasOnlyBootstrapAdmins =
    activeAdmins.length > 0 &&
    activeAdmins.every(
      (admin) => admin.email && isBootstrapPlaceholderEmail(admin.email, config)
    );
  const isCurrentMember =
    normalizedEmail !== null &&
    activeAdmins.some((admin) => admin.email === normalizedEmail);
  const isAllowedOwner =
    normalizedEmail !== null &&
    config.bootstrapOwnerEmails.includes(normalizedEmail);

  let claimStatus: BootstrapClaimStatus;

  if (!normalizedEmail) {
    claimStatus = "not_authenticated";
  } else if (isCurrentMember) {
    claimStatus = "already_member";
  } else if (!hasOnlyBootstrapAdmins) {
    claimStatus = "setup_locked";
  } else if (!isAllowedOwner) {
    claimStatus = "email_not_allowed";
  } else {
    claimStatus = "ready";
  }

  const context: BootstrapContextDto = {
    authenticatedEmail: normalizedEmail,
    canClaimOwnership: claimStatus === "ready",
    claimStatus,
    householdName: config.householdName
  };

  return context;
}

export async function claimBootstrapOwnership(
  db: DatabaseClient,
  config: BootstrapConfig,
  authenticatedEmail: string | null
) {
  const context = await getBootstrapContext(db, config, authenticatedEmail);

  switch (context.claimStatus) {
    case "not_authenticated":
      throw new ApiError(401, "unauthorized", "Authentication required.");
    case "already_member":
      throw new ApiError(409, "user_exists", "Authenticated user is already a household member.");
    case "email_not_allowed":
      throw new ApiError(
        403,
        "bootstrap_claim_not_allowed",
        "Authenticated email is not allowed to claim household ownership."
      );
    case "setup_locked":
      throw new ApiError(
        403,
        "bootstrap_claim_locked",
        "Bootstrap ownership claim is no longer available for this household."
      );
    case "ready":
      break;
  }

  const normalizedEmail = normalizeEmail(authenticatedEmail!);
  const [existingUser] = await db
    .select({
      id: users.id
    })
    .from(users)
    .where(eq(users.email, normalizedEmail));

  if (existingUser) {
    throw new ApiError(409, "user_exists", "A household user with that email already exists.");
  }

  const [createdAdmin] = await db
    .insert(users)
    .values({
      deactivatedAt: null,
      displayName: toDisplayName(normalizedEmail),
      email: normalizedEmail,
      externalAuthId: null,
      householdId: DEFAULT_HOUSEHOLD_ID,
      role: "admin",
      serviceKind: null
    })
    .returning({
      displayName: users.displayName,
      email: users.email,
      householdId: users.householdId,
      id: users.id,
      role: users.role,
      serviceKind: users.serviceKind
    });

  const actor = getRequiredRow(
    createdAdmin,
    "bootstrap_claim_failed",
    "Bootstrap household owner claim failed."
  );

  return {
    actor: {
      ...actor,
      authStrategy: "trusted_header" as const
    }
  };
}

function mapServiceTokenDto(row: {
  createdAt: Date;
  expiresAt: Date | null;
  id: string;
  lastUsedAt: Date | null;
  name: string;
  revokedAt: Date | null;
  userId: string;
}) {
  const token: ServiceTokenDto = {
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
    id: row.id,
    lastUsedAt: row.lastUsedAt,
    name: row.name,
    revokedAt: row.revokedAt,
    userId: row.userId
  };

  return token;
}

export async function createHouseholdUser(
  db: DatabaseClient,
  actor: AuthenticatedActor,
  input: CreateHouseholdUserInput
) {
  assertAdmin(actor);

  if (input.role === "admin") {
    const normalizedEmail = input.email.trim().toLowerCase();

    const [existingAdmin] = await db
      .select({
        id: users.id
      })
      .from(users)
      .where(eq(users.email, normalizedEmail));

    if (existingAdmin) {
      throw new ApiError(409, "user_exists", "A household user with that email already exists.");
    }

    const [createdAdmin] = await db
      .insert(users)
      .values({
        deactivatedAt: null,
        displayName: input.displayName.trim(),
        email: normalizedEmail,
        externalAuthId: null,
        householdId: actor.householdId,
        role: "admin",
        serviceKind: null
      })
      .returning({
        deactivatedAt: users.deactivatedAt,
        displayName: users.displayName,
        email: users.email,
        id: users.id,
        role: users.role,
        serviceKind: users.serviceKind
      });

    return {
      item: mapUserRef(
        getRequiredRow(createdAdmin, "user_create_failed", "Household user creation failed.")
      )
    };
  }

  const [createdService] = await db
    .insert(users)
    .values({
      deactivatedAt: null,
      displayName: input.displayName.trim(),
      email: null,
      externalAuthId: null,
      householdId: actor.householdId,
      role: "service",
      serviceKind: input.serviceKind.trim()
    })
    .returning({
      deactivatedAt: users.deactivatedAt,
      displayName: users.displayName,
      email: users.email,
      id: users.id,
      role: users.role,
      serviceKind: users.serviceKind
    });

  return {
    item: mapUserRef(
      getRequiredRow(createdService, "user_create_failed", "Household user creation failed.")
    )
  };
}

export async function updateHouseholdUser(
  db: DatabaseClient,
  actor: AuthenticatedActor,
  userId: string,
  input: UpdateHouseholdUserInput
) {
  assertAdmin(actor);

  const current = await getHouseholdUserOrThrow(db, actor.householdId, userId);

  if (current.deactivatedAt) {
    throw new ApiError(
      409,
      "user_removed",
      "Removed household actors cannot be edited."
    );
  }

  if (current.role === "admin" && input.serviceKind) {
    throw new ApiError(
      400,
      "invalid_user_update",
      "Admin users cannot have a service kind."
    );
  }

  if (current.role === "service" && input.email !== undefined) {
    throw new ApiError(
      400,
      "invalid_user_update",
      "Service actors cannot be updated with an email address."
    );
  }

  let normalizedEmail = current.email;

  if (current.role === "admin" && input.email !== undefined) {
    normalizedEmail = input.email === null ? null : input.email.trim().toLowerCase();

    if (!normalizedEmail) {
      throw new ApiError(400, "invalid_email", "Admin users require an email address.");
    }

    const [existingAdmin] = await db
      .select({
        id: users.id
      })
      .from(users)
      .where(and(eq(users.email, normalizedEmail), isNull(users.deactivatedAt)));

    if (existingAdmin && existingAdmin.id !== current.id) {
      throw new ApiError(409, "user_exists", "A household user with that email already exists.");
    }
  }

  await db
    .update(users)
    .set({
      displayName: input.displayName?.trim() || current.displayName,
      email: current.role === "admin" ? normalizedEmail : null,
      serviceKind:
        current.role === "service"
          ? input.serviceKind?.trim() || current.serviceKind
          : null,
      updatedAt: new Date()
    })
    .where(eq(users.id, current.id));

  const updated = await getHouseholdUserOrThrow(db, actor.householdId, current.id);

  return {
    item: mapUserRef(updated)
  };
}

export async function removeHouseholdUser(
  db: DatabaseClient,
  actor: AuthenticatedActor,
  userId: string
) {
  assertAdmin(actor);

  const current = await getHouseholdUserOrThrow(db, actor.householdId, userId);

  if (current.id === actor.id) {
    throw new ApiError(
      400,
      "cannot_remove_current_actor",
      "You cannot remove the currently authenticated admin."
    );
  }

  if (current.deactivatedAt) {
    throw new ApiError(
      409,
      "user_removed",
      "This household actor has already been removed."
    );
  }

  const removedAt = new Date();

  await db
    .update(users)
    .set({
      deactivatedAt: removedAt,
      updatedAt: removedAt
    })
    .where(eq(users.id, current.id));

  await db
    .update(tasks)
    .set({
      assigneeUserId: null,
      updatedAt: removedAt,
      updatedByUserId: actor.id
    })
    .where(and(eq(tasks.assigneeUserId, current.id), isNull(tasks.archivedAt)));

  await db
    .update(recurringTaskTemplates)
    .set({
      defaultAssigneeUserId: null,
      updatedAt: removedAt,
      updatedByUserId: actor.id
    })
    .where(eq(recurringTaskTemplates.defaultAssigneeUserId, current.id));

  if (current.role === "service") {
    await db
      .update(serviceTokens)
      .set({
        revokedAt: removedAt
      })
      .where(and(eq(serviceTokens.userId, current.id), isNull(serviceTokens.revokedAt)));
  }

  const removed = await getHouseholdUserOrThrow(db, actor.householdId, current.id);

  return {
    item: mapUserRef(removed)
  };
}

export async function listServiceTokensForUser(
  db: DatabaseClient,
  actor: AuthenticatedActor,
  userId: string
) {
  assertAdmin(actor);

  const user = await getHouseholdUserOrThrow(db, actor.householdId, userId);

  if (user.role !== "service") {
    throw new ApiError(
      400,
      "invalid_service_actor",
      "Service tokens can only be managed for service actors."
    );
  }

  const rows = await db
    .select({
      createdAt: serviceTokens.createdAt,
      expiresAt: serviceTokens.expiresAt,
      id: serviceTokens.id,
      lastUsedAt: serviceTokens.lastUsedAt,
      name: serviceTokens.name,
      revokedAt: serviceTokens.revokedAt,
      userId: serviceTokens.userId
    })
    .from(serviceTokens)
    .where(eq(serviceTokens.userId, user.id));

  rows.sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());

  return {
    items: rows.map((row) => mapServiceTokenDto(row))
  };
}

export async function issueServiceTokenForUser(
  db: DatabaseClient,
  actor: AuthenticatedActor,
  userId: string,
  input: IssueServiceTokenInput
) {
  assertAdmin(actor);

  const user = await getHouseholdUserOrThrow(db, actor.householdId, userId);

  if (user.role !== "service" || user.deactivatedAt) {
    throw new ApiError(
      400,
      "invalid_service_actor",
      "Only active service actors can receive service tokens."
    );
  }

  const issued = await issueServiceToken({
    db,
    name: input.name.trim(),
    userId: user.id
  });
  const issuedRecord = getRequiredRow(
    issued.record,
    "service_token_create_failed",
    "Service token creation failed."
  );

  const record = getRequiredRow(
    await db
      .select({
        createdAt: serviceTokens.createdAt,
        expiresAt: serviceTokens.expiresAt,
        id: serviceTokens.id,
        lastUsedAt: serviceTokens.lastUsedAt,
        name: serviceTokens.name,
        revokedAt: serviceTokens.revokedAt,
        userId: serviceTokens.userId
      })
      .from(serviceTokens)
      .where(eq(serviceTokens.id, issuedRecord.id))
      .then((rows) => rows[0]),
    "service_token_create_failed",
    "Service token creation failed."
  );

  return {
    item: mapServiceTokenDto(record),
    plainTextToken: issued.token
  };
}

export async function revokeServiceToken(
  db: DatabaseClient,
  actor: AuthenticatedActor,
  tokenId: string
) {
  assertAdmin(actor);

  const [token] = await db
    .select({
      createdAt: serviceTokens.createdAt,
      expiresAt: serviceTokens.expiresAt,
      householdId: users.householdId,
      id: serviceTokens.id,
      lastUsedAt: serviceTokens.lastUsedAt,
      name: serviceTokens.name,
      revokedAt: serviceTokens.revokedAt,
      userId: serviceTokens.userId
    })
    .from(serviceTokens)
    .innerJoin(users, eq(serviceTokens.userId, users.id))
    .where(eq(serviceTokens.id, tokenId));

  if (!token || token.householdId !== actor.householdId) {
    throw new ApiError(404, "service_token_not_found", "Service token not found.");
  }

  await db
    .update(serviceTokens)
    .set({
      revokedAt: token.revokedAt ?? new Date()
    })
    .where(eq(serviceTokens.id, token.id));

  const [updated] = await db
    .select({
      createdAt: serviceTokens.createdAt,
      expiresAt: serviceTokens.expiresAt,
      id: serviceTokens.id,
      lastUsedAt: serviceTokens.lastUsedAt,
      name: serviceTokens.name,
      revokedAt: serviceTokens.revokedAt,
      userId: serviceTokens.userId
    })
    .from(serviceTokens)
    .where(eq(serviceTokens.id, token.id));

  return {
    item: mapServiceTokenDto(
      getRequiredRow(updated, "service_token_revoke_failed", "Service token revocation failed.")
    )
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

export async function updateLabel(
  db: DatabaseClient,
  actor: AuthenticatedActor,
  labelId: string,
  input: UpdateLabelInput
) {
  assertAdmin(actor);

  const [current] = await db
    .select()
    .from(labels)
    .where(and(eq(labels.householdId, actor.householdId), eq(labels.id, labelId)));

  if (!current) {
    throw new ApiError(404, "label_not_found", "Label not found.");
  }

  const nextName = input.name?.trim() ?? current.name;

  if (nextName !== current.name) {
    const [existing] = await db
      .select({
        id: labels.id
      })
      .from(labels)
      .where(and(eq(labels.householdId, actor.householdId), eq(labels.name, nextName)));

    if (existing) {
      throw new ApiError(409, "label_exists", "A label with that name already exists.");
    }
  }

  const [updated] = await db
    .update(labels)
    .set({
      color: input.color === undefined ? current.color : input.color,
      name: nextName,
      updatedAt: new Date()
    })
    .where(eq(labels.id, current.id))
    .returning();

  const label = getRequiredRow(updated, "label_update_failed", "Label update failed.");

  return {
    item: {
      color: label.color,
      createdAt: label.createdAt,
      id: label.id,
      name: label.name,
      updatedAt: label.updatedAt
    }
  };
}

export async function deleteLabel(
  db: DatabaseClient,
  actor: AuthenticatedActor,
  labelId: string
) {
  assertAdmin(actor);

  const [deleted] = await db
    .delete(labels)
    .where(and(eq(labels.householdId, actor.householdId), eq(labels.id, labelId)))
    .returning();

  if (!deleted) {
    throw new ApiError(404, "label_not_found", "Label not found.");
  }

  return {
    item: {
      color: deleted.color,
      createdAt: deleted.createdAt,
      id: deleted.id,
      name: deleted.name,
      updatedAt: deleted.updatedAt
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

  if (input.defaultRetrospectiveTemplateId) {
    await getRetrospectiveTemplateOrThrowForSettings(
      db,
      actor,
      input.defaultRetrospectiveTemplateId
    );
  }

  const [updated] = await db
    .update(householdSettings)
    .set({
      defaultCalendarExportKind:
        input.defaultCalendarExportKind ?? current.defaultCalendarExportKind,
      defaultRetrospectiveTemplateId:
        input.defaultRetrospectiveTemplateId === undefined
          ? current.defaultRetrospectiveTemplateId
          : input.defaultRetrospectiveTemplateId,
      defaultTimezone: input.defaultTimezone ?? current.defaultTimezone,
      doneArchiveAfterDays: input.doneArchiveAfterDays ?? current.doneArchiveAfterDays,
      finalizedRetrospectiveEditPolicy:
        input.finalizedRetrospectiveEditPolicy ??
        current.finalizedRetrospectiveEditPolicy,
      nearDueThresholdDays: input.nearDueThresholdDays ?? current.nearDueThresholdDays,
      retrospectiveCadence:
        input.retrospectiveCadence ?? current.retrospectiveCadence,
      retrospectiveCadenceInterval:
        input.retrospectiveCadenceInterval ??
        current.retrospectiveCadenceInterval,
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
    conditions.push(
      or(eq(tasks.aiAssistanceEnabled, true), eq(tasks.assigneeUserId, actor.id))!
    );
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
  const events = await db.select().from(taskEvents).where(eq(taskEvents.taskId, taskId))
    .orderBy(desc(taskEvents.createdAt), desc(taskEvents.id));
  const actors = await getUserRefsById(db, events.map((event) => event.actorUserId));

  return {
    item: {
      ...item,
      attachments: relations.attachmentsByTaskId.get(task.id) ?? [],
      comments: relations.commentsByTaskId.get(task.id) ?? [],
      history: events.map((event) => ({ id: event.id, actor: actors.get(event.actorUserId) ?? null, eventType: event.eventType, createdAt: event.createdAt }))
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

export async function addChecklistItemToTask(
  db: DatabaseClient,
  actor: AuthenticatedActor,
  taskId: string,
  input: AddChecklistItemInput,
  options: MutationAuditOptions = {}
) {
  const current = await getTaskOrThrow(db, actor, taskId);
  assertExpectedRevision(current.revision, input.expectedRevision);

  if (current.archivedAt) {
    throw new ApiError(409, "task_archived", "Archived tasks cannot be edited.");
  }

  const [lastChecklistItem] = await db
    .select({
      sortOrder: checklistItems.sortOrder
    })
    .from(checklistItems)
    .where(eq(checklistItems.taskId, taskId))
    .orderBy(desc(checklistItems.sortOrder))
    .limit(1);

  await db.insert(checklistItems).values({
    body: input.body.trim(),
    isCompleted: false,
    sortOrder: (lastChecklistItem?.sortOrder ?? -1) + 1,
    taskId
  });

  await db
    .update(tasks)
    .set({
      revision: current.revision + 1,
      updatedAt: new Date(),
      updatedByUserId: actor.id
    })
    .where(eq(tasks.id, taskId));

  await createTaskEventRecord(
    db,
    taskId,
    actor.id,
    "task.checklist_item_added",
    {
      revision: current.revision + 1
    },
    options
  );

  return getTaskDetail(db, actor, taskId);
}

export async function setChecklistItemCompletion(
  db: DatabaseClient,
  actor: AuthenticatedActor,
  taskId: string,
  checklistItemId: string,
  input: SetChecklistItemCompletionInput,
  options: MutationAuditOptions = {}
) {
  const current = await getTaskOrThrow(db, actor, taskId);
  assertExpectedRevision(current.revision, input.expectedRevision);

  if (current.archivedAt) {
    throw new ApiError(409, "task_archived", "Archived tasks cannot be edited.");
  }

  const checklistItem = await getChecklistItemOrThrow(db, taskId, checklistItemId);

  await db
    .update(checklistItems)
    .set({
      isCompleted: input.isCompleted,
      updatedAt: new Date()
    })
    .where(eq(checklistItems.id, checklistItem.id));

  await db
    .update(tasks)
    .set({
      revision: current.revision + 1,
      updatedAt: new Date(),
      updatedByUserId: actor.id
    })
    .where(eq(tasks.id, taskId));

  await createTaskEventRecord(
    db,
    taskId,
    actor.id,
    "task.checklist_item_completion_set",
    {
      checklistItemId,
      isCompleted: input.isCompleted,
      revision: current.revision + 1
    },
    options
  );

  return getTaskDetail(db, actor, taskId);
}

export async function deleteChecklistItemFromTask(
  db: DatabaseClient,
  actor: AuthenticatedActor,
  taskId: string,
  checklistItemId: string,
  input: DeleteChecklistItemInput,
  options: MutationAuditOptions = {}
) {
  const current = await getTaskOrThrow(db, actor, taskId);
  assertExpectedRevision(current.revision, input.expectedRevision);

  if (current.archivedAt) {
    throw new ApiError(409, "task_archived", "Archived tasks cannot be edited.");
  }

  await getChecklistItemOrThrow(db, taskId, checklistItemId);

  await db.delete(checklistItems).where(eq(checklistItems.id, checklistItemId));
  await resequenceChecklistItems(db, taskId);

  await db
    .update(tasks)
    .set({
      revision: current.revision + 1,
      updatedAt: new Date(),
      updatedByUserId: actor.id
    })
    .where(eq(tasks.id, taskId));

  await createTaskEventRecord(
    db,
    taskId,
    actor.id,
    "task.checklist_item_deleted",
    {
      checklistItemId,
      revision: current.revision + 1
    },
    options
  );

  return getTaskDetail(db, actor, taskId);
}

export async function transitionTask(
  db: DatabaseClient,
  actor: AuthenticatedActor,
  taskId: string,
  input: TransitionTaskInput,
  options: MutationAuditOptions = {}
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
  }, options);

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
  input: AddCommentInput,
  options: MutationAuditOptions = {}
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

  await createTaskEventRecord(db, taskId, actor.id, "task.comment_added", {}, options);

  return getTaskDetail(db, actor, taskId);
}

export async function updateTaskComment(
  db: DatabaseClient, actor: AuthenticatedActor, taskId: string, commentId: string,
  input: { body: string; expectedUpdatedAt: string }
) {
  await getTaskOrThrow(db, actor, taskId);
  const [comment] = await db.select().from(comments).where(and(eq(comments.id, commentId), eq(comments.taskId, taskId)));
  if (!comment) throw new ApiError(404, "not_found", "Comment not found.");
  if (comment.authorUserId !== actor.id) throw new ApiError(403, "forbidden", "Only the author can edit this comment.");
  const updated = await db.update(comments).set({ body: input.body.trim(), updatedAt: new Date() })
    .where(and(eq(comments.id, commentId), eq(comments.updatedAt, new Date(input.expectedUpdatedAt))))
    .returning({ id: comments.id });
  if (updated.length === 0) throw new ApiError(409, "conflict", "This comment changed. Reload it before editing again.");
  await createTaskEventRecord(db, taskId, actor.id, "task.comment_updated", { commentId });
  return getTaskDetail(db, actor, taskId);
}

export async function addAttachmentLinkToTask(
  db: DatabaseClient,
  actor: AuthenticatedActor,
  taskId: string,
  input: AddAttachmentLinkInput,
  options: MutationAuditOptions = {}
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
  }, options);

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

export async function deleteArchivedTask(
  db: DatabaseClient,
  actor: AuthenticatedActor,
  taskId: string,
  expectedRevision: number
) {
  const current = await getTaskOrThrowForAdmin(db, actor, taskId);
  assertExpectedRevision(current.revision, expectedRevision);

  if (!current.archivedAt) {
    throw new ApiError(
      409,
      "task_not_archived",
      "Only archived tasks can be deleted permanently."
    );
  }

  const uploadRows = await db
    .select({
      storagePath: attachments.storagePath
    })
    .from(attachments)
    .where(
      and(
        eq(attachments.taskId, taskId),
        eq(attachments.storageKind, "upload"),
        isNotNull(attachments.storagePath)
      )
    );

  await db.delete(tasks).where(eq(tasks.id, taskId));

  return {
    deletedTaskId: taskId,
    uploadStoragePaths: uploadRows.flatMap((row) =>
      row.storagePath ? [row.storagePath] : []
    )
  };
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
