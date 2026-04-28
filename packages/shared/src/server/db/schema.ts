import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex
} from "drizzle-orm/sqlite-core";

function createId() {
  return crypto.randomUUID();
}

function now() {
  return new Date();
}

export const households = sqliteTable("households", {
  id: text("id").primaryKey().$defaultFn(createId),
  name: text("name").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(now),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(now)
});

export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey().$defaultFn(createId),
    householdId: text("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    externalAuthId: text("external_auth_id"),
    email: text("email"),
    displayName: text("display_name").notNull(),
    role: text("role", { enum: ["admin", "service"] }).notNull(),
    serviceKind: text("service_kind"),
    deactivatedAt: integer("deactivated_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(now),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(now)
  },
  (table) => [
    uniqueIndex("users_external_auth_id_idx").on(table.externalAuthId),
    uniqueIndex("users_email_idx").on(table.email),
    index("users_household_id_idx").on(table.householdId),
    index("users_household_deactivated_at_idx").on(
      table.householdId,
      table.deactivatedAt
    )
  ]
);

export const serviceTokens = sqliteTable(
  "service_tokens",
  {
    id: text("id").primaryKey().$defaultFn(createId),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    tokenHash: text("token_hash").notNull(),
    lastUsedAt: integer("last_used_at", { mode: "timestamp_ms" }),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }),
    revokedAt: integer("revoked_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(now)
  },
  (table) => [
    index("service_tokens_user_id_idx").on(table.userId),
    uniqueIndex("service_tokens_token_hash_idx").on(table.tokenHash)
  ]
);

export const recurringTaskTemplates = sqliteTable(
  "recurring_task_templates",
  {
    id: text("id").primaryKey().$defaultFn(createId),
    householdId: text("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    defaultAssigneeUserId: text("default_assignee_user_id").references(
      () => users.id,
      {
        onDelete: "set null"
      }
    ),
    aiAssistanceEnabledDefault: integer("ai_assistance_enabled_default", {
      mode: "boolean"
    })
      .notNull()
      .default(false),
    defaultDueTime: text("default_due_time"),
    recurrenceCadence: text("recurrence_cadence", {
      enum: ["daily", "weekly", "monthly"]
    }).notNull(),
    recurrenceInterval: integer("recurrence_interval").notNull().default(1),
    nextOccurrenceOn: text("next_occurrence_on").notNull(),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    updatedByUserId: text("updated_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(now),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(now)
  },
  (table) => [
    index("recurring_task_templates_household_id_idx").on(table.householdId),
    index("recurring_task_templates_next_occurrence_on_idx").on(
      table.nextOccurrenceOn
    )
  ]
);

export const tasks = sqliteTable(
  "tasks",
  {
    id: text("id").primaryKey().$defaultFn(createId),
    householdId: text("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    recurringTaskTemplateId: text("recurring_task_template_id").references(
      () => recurringTaskTemplates.id,
      {
        onDelete: "set null"
      }
    ),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    status: text("status", {
      enum: ["To Do", "In Progress", "Waiting", "Done"]
    })
      .notNull()
      .default("To Do"),
    assigneeUserId: text("assignee_user_id").references(() => users.id, {
      onDelete: "set null"
    }),
    aiAssistanceEnabled: integer("ai_assistance_enabled", {
      mode: "boolean"
    })
      .notNull()
      .default(false),
    dueOn: text("due_on"),
    dueTime: text("due_time"),
    sortKey: integer("sort_key").notNull().default(0),
    revision: integer("revision").notNull().default(0),
    completedAt: integer("completed_at", { mode: "timestamp_ms" }),
    archivedAt: integer("archived_at", { mode: "timestamp_ms" }),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    updatedByUserId: text("updated_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(now),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(now)
  },
  (table) => [
    index("tasks_household_id_idx").on(table.householdId),
    index("tasks_status_sort_key_idx").on(table.status, table.sortKey),
    index("tasks_assignee_user_id_idx").on(table.assigneeUserId),
    index("tasks_recurring_task_template_id_idx").on(
      table.recurringTaskTemplateId
    ),
    index("tasks_archived_at_idx").on(table.archivedAt)
  ]
);

export const checklistItems = sqliteTable(
  "checklist_items",
  {
    id: text("id").primaryKey().$defaultFn(createId),
    taskId: text("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    isCompleted: integer("is_completed", { mode: "boolean" })
      .notNull()
      .default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(now),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(now)
  },
  (table) => [index("checklist_items_task_id_idx").on(table.taskId)]
);

export const labels = sqliteTable(
  "labels",
  {
    id: text("id").primaryKey().$defaultFn(createId),
    householdId: text("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    color: text("color"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(now),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(now)
  },
  (table) => [
    index("labels_household_id_idx").on(table.householdId),
    uniqueIndex("labels_household_name_idx").on(table.householdId, table.name)
  ]
);

export const taskLabels = sqliteTable(
  "task_labels",
  {
    taskId: text("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    labelId: text("label_id")
      .notNull()
      .references(() => labels.id, { onDelete: "cascade" })
  },
  (table) => [
    primaryKey({ columns: [table.taskId, table.labelId] }),
    index("task_labels_label_id_idx").on(table.labelId)
  ]
);

export const recurringTaskTemplateChecklistItems = sqliteTable(
  "recurring_task_template_checklist_items",
  {
    id: text("id").primaryKey().$defaultFn(createId),
    recurringTaskTemplateId: text("recurring_task_template_id")
      .notNull()
      .references(() => recurringTaskTemplates.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(now),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(now)
  },
  (table) => [
    index("recurring_task_template_checklist_items_template_id_idx").on(
      table.recurringTaskTemplateId
    )
  ]
);

export const recurringTaskTemplateLabels = sqliteTable(
  "recurring_task_template_labels",
  {
    recurringTaskTemplateId: text("recurring_task_template_id")
      .notNull()
      .references(() => recurringTaskTemplates.id, { onDelete: "cascade" }),
    labelId: text("label_id")
      .notNull()
      .references(() => labels.id, { onDelete: "cascade" })
  },
  (table) => [
    primaryKey({ columns: [table.recurringTaskTemplateId, table.labelId] }),
    index("recurring_task_template_labels_label_id_idx").on(table.labelId)
  ]
);

export const comments = sqliteTable(
  "comments",
  {
    id: text("id").primaryKey().$defaultFn(createId),
    taskId: text("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    authorUserId: text("author_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    body: text("body").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(now),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(now)
  },
  (table) => [index("comments_task_id_idx").on(table.taskId)]
);

export const attachments = sqliteTable(
  "attachments",
  {
    id: text("id").primaryKey().$defaultFn(createId),
    taskId: text("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    uploadedByUserId: text("uploaded_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    storageKind: text("storage_kind", {
      enum: ["upload", "external_link"]
    }).notNull(),
    originalName: text("original_name").notNull(),
    mimeType: text("mime_type"),
    storagePath: text("storage_path"),
    externalUrl: text("external_url"),
    byteSize: integer("byte_size"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(now)
  },
  (table) => [index("attachments_task_id_idx").on(table.taskId)]
);

export const retrospectiveTemplates = sqliteTable(
  "retrospective_templates",
  {
    id: text("id").primaryKey().$defaultFn(createId),
    householdId: text("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    isSystem: integer("is_system", { mode: "boolean" }).notNull().default(false),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    updatedByUserId: text("updated_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(now),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(now)
  },
  (table) => [index("retrospective_templates_household_id_idx").on(table.householdId)]
);

export const retrospectiveTemplateRounds = sqliteTable(
  "retrospective_template_rounds",
  {
    id: text("id").primaryKey().$defaultFn(createId),
    templateId: text("template_id")
      .notNull()
      .references(() => retrospectiveTemplates.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    kind: text("kind", {
      enum: ["commitment_review", "task_lookback", "notes", "commitment_capture"]
    }).notNull(),
    prompt: text("prompt").notNull().default(""),
    sortOrder: integer("sort_order").notNull().default(0),
    entryPhase: text("entry_phase", {
      enum: ["commitment_period", "retrospective", "both"]
    }),
    privacy: text("privacy", {
      enum: ["shared", "private_until_round", "private"]
    }),
    configJson: text("config_json").notNull().default("{}"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(now),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(now)
  },
  (table) => [
    index("retrospective_template_rounds_template_id_idx").on(table.templateId)
  ]
);

export const commitmentPeriods = sqliteTable(
  "commitment_periods",
  {
    id: text("id").primaryKey().$defaultFn(createId),
    householdId: text("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    openedByRetrospectiveId: text("opened_by_retrospective_id"),
    reviewedByRetrospectiveId: text("reviewed_by_retrospective_id"),
    status: text("status", { enum: ["active", "closed", "reviewed"] })
      .notNull()
      .default("active"),
    periodStartOn: text("period_start_on").notNull(),
    closureOn: text("closure_on").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(now),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(now)
  },
  (table) => [
    index("commitment_periods_household_status_idx").on(table.householdId, table.status),
    index("commitment_periods_household_closure_idx").on(table.householdId, table.closureOn)
  ]
);

export const retrospectives = sqliteTable(
  "retrospectives",
  {
    id: text("id").primaryKey().$defaultFn(createId),
    householdId: text("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    templateId: text("template_id")
      .notNull()
      .references(() => retrospectiveTemplates.id, { onDelete: "restrict" }),
    commitmentPeriodId: text("commitment_period_id")
      .notNull()
      .references(() => commitmentPeriods.id, { onDelete: "restrict" }),
    title: text("title").notNull(),
    status: text("status", { enum: ["draft", "active", "finalized"] })
      .notNull()
      .default("draft"),
    currentRoundId: text("current_round_id"),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    updatedByUserId: text("updated_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    startedAt: integer("started_at", { mode: "timestamp_ms" }),
    finalizedAt: integer("finalized_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(now),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(now)
  },
  (table) => [
    index("retrospectives_household_status_idx").on(table.householdId, table.status),
    index("retrospectives_commitment_period_idx").on(table.commitmentPeriodId)
  ]
);

export const retrospectiveRounds = sqliteTable(
  "retrospective_rounds",
  {
    id: text("id").primaryKey().$defaultFn(createId),
    retrospectiveId: text("retrospective_id")
      .notNull()
      .references(() => retrospectives.id, { onDelete: "cascade" }),
    sourceTemplateRoundId: text("source_template_round_id").references(
      () => retrospectiveTemplateRounds.id,
      { onDelete: "set null" }
    ),
    title: text("title").notNull(),
    kind: text("kind", {
      enum: ["commitment_review", "task_lookback", "notes", "commitment_capture"]
    }).notNull(),
    prompt: text("prompt").notNull().default(""),
    sortOrder: integer("sort_order").notNull().default(0),
    entryPhase: text("entry_phase", {
      enum: ["commitment_period", "retrospective", "both"]
    }),
    privacy: text("privacy", {
      enum: ["shared", "private_until_round", "private"]
    }),
    configJson: text("config_json").notNull().default("{}"),
    startedAt: integer("started_at", { mode: "timestamp_ms" }),
    completedAt: integer("completed_at", { mode: "timestamp_ms" }),
    summary: text("summary").notNull().default(""),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(now),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(now)
  },
  (table) => [
    index("retrospective_rounds_retrospective_id_idx").on(table.retrospectiveId)
  ]
);

export const retrospectiveNotes = sqliteTable(
  "retrospective_notes",
  {
    id: text("id").primaryKey().$defaultFn(createId),
    householdId: text("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    commitmentPeriodId: text("commitment_period_id")
      .notNull()
      .references(() => commitmentPeriods.id, { onDelete: "cascade" }),
    templateRoundId: text("template_round_id").references(
      () => retrospectiveTemplateRounds.id,
      { onDelete: "set null" }
    ),
    retrospectiveId: text("retrospective_id").references(() => retrospectives.id, {
      onDelete: "set null"
    }),
    roundId: text("round_id").references(() => retrospectiveRounds.id, {
      onDelete: "set null"
    }),
    authorUserId: text("author_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    body: text("body").notNull(),
    entryPhase: text("entry_phase", {
      enum: ["commitment_period", "retrospective"]
    }).notNull(),
    visibilityState: text("visibility_state", {
      enum: ["shared", "private_until_round", "private", "revealed"]
    }).notNull(),
    revealedInRetrospectiveId: text("revealed_in_retrospective_id").references(
      () => retrospectives.id,
      { onDelete: "set null" }
    ),
    revealedInRoundId: text("revealed_in_round_id").references(
      () => retrospectiveRounds.id,
      { onDelete: "set null" }
    ),
    revealedAt: integer("revealed_at", { mode: "timestamp_ms" }),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(now),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(now)
  },
  (table) => [
    index("retrospective_notes_household_author_idx").on(
      table.householdId,
      table.authorUserId
    ),
    index("retrospective_notes_period_idx").on(table.commitmentPeriodId),
    index("retrospective_notes_round_idx").on(table.roundId),
    index("retrospective_notes_revealed_retrospective_idx").on(
      table.revealedInRetrospectiveId
    )
  ]
);

export const commitments = sqliteTable(
  "commitments",
  {
    id: text("id").primaryKey().$defaultFn(createId),
    householdId: text("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    commitmentPeriodId: text("commitment_period_id").references(
      () => commitmentPeriods.id,
      { onDelete: "set null" }
    ),
    createdInRetrospectiveId: text("created_in_retrospective_id").references(
      () => retrospectives.id,
      { onDelete: "set null" }
    ),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    assigneeUserId: text("assignee_user_id").references(() => users.id, {
      onDelete: "set null"
    }),
    trackingKind: text("tracking_kind", {
      enum: ["binary", "count_per_period", "checklist", "freeform"]
    }).notNull(),
    trackingInterval: text("tracking_interval", {
      enum: ["none", "daily", "weekly", "monthly"]
    })
      .notNull()
      .default("none"),
    targetCount: integer("target_count"),
    status: text("status", { enum: ["active", "reviewed", "archived"] })
      .notNull()
      .default("active"),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    updatedByUserId: text("updated_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    completedAt: integer("completed_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(now),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(now)
  },
  (table) => [
    index("commitments_household_status_idx").on(table.householdId, table.status),
    index("commitments_period_idx").on(table.commitmentPeriodId),
    index("commitments_created_in_retrospective_idx").on(
      table.createdInRetrospectiveId
    )
  ]
);

export const commitmentCheckins = sqliteTable(
  "commitment_checkins",
  {
    id: text("id").primaryKey().$defaultFn(createId),
    commitmentId: text("commitment_id")
      .notNull()
      .references(() => commitments.id, { onDelete: "cascade" }),
    actorUserId: text("actor_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    checkinOn: text("checkin_on").notNull(),
    amount: integer("amount").notNull().default(1),
    note: text("note").notNull().default(""),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(now),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(now)
  },
  (table) => [
    index("commitment_checkins_commitment_id_idx").on(table.commitmentId),
    index("commitment_checkins_commitment_date_idx").on(
      table.commitmentId,
      table.checkinOn
    )
  ]
);

export const commitmentChecklistItems = sqliteTable(
  "commitment_checklist_items",
  {
    id: text("id").primaryKey().$defaultFn(createId),
    commitmentId: text("commitment_id")
      .notNull()
      .references(() => commitments.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    isCompleted: integer("is_completed", { mode: "boolean" })
      .notNull()
      .default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(now),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(now)
  },
  (table) => [
    index("commitment_checklist_items_commitment_id_idx").on(table.commitmentId)
  ]
);

export const commitmentReviews = sqliteTable(
  "commitment_reviews",
  {
    id: text("id").primaryKey().$defaultFn(createId),
    commitmentId: text("commitment_id")
      .notNull()
      .references(() => commitments.id, { onDelete: "cascade" }),
    retrospectiveId: text("retrospective_id")
      .notNull()
      .references(() => retrospectives.id, { onDelete: "cascade" }),
    roundId: text("round_id")
      .notNull()
      .references(() => retrospectiveRounds.id, { onDelete: "cascade" }),
    rating: text("rating", {
      enum: ["met", "mostly_met", "partly_met", "missed", "skipped"]
    }).notNull(),
    note: text("note").notNull().default(""),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    updatedByUserId: text("updated_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(now),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(now)
  },
  (table) => [
    index("commitment_reviews_commitment_id_idx").on(table.commitmentId),
    index("commitment_reviews_retrospective_id_idx").on(table.retrospectiveId),
    uniqueIndex("commitment_reviews_commitment_retrospective_idx").on(
      table.commitmentId,
      table.retrospectiveId
    )
  ]
);

export const householdSettings = sqliteTable("household_settings", {
  householdId: text("household_id")
    .primaryKey()
    .references(() => households.id, { onDelete: "cascade" }),
  doneArchiveAfterDays: integer("done_archive_after_days").notNull().default(30),
  nearDueThresholdDays: integer("near_due_threshold_days").notNull().default(3),
  defaultTimezone: text("default_timezone").notNull(),
  defaultCalendarExportKind: text("default_calendar_export_kind", {
    enum: ["google", "ics"]
  })
    .notNull()
    .default("google"),
  retrospectiveCadence: text("retrospective_cadence", {
    enum: ["weekly", "monthly", "quarterly", "custom"]
  })
    .notNull()
    .default("monthly"),
  retrospectiveCadenceInterval: integer("retrospective_cadence_interval")
    .notNull()
    .default(1),
  defaultRetrospectiveTemplateId: text("default_retrospective_template_id").references(
    () => retrospectiveTemplates.id,
    { onDelete: "set null" }
  ),
  finalizedRetrospectiveEditPolicy: text("finalized_retrospective_edit_policy", {
    enum: ["locked", "editable"]
  })
    .notNull()
    .default("locked"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(now),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(now)
});

export const taskEvents = sqliteTable(
  "task_events",
  {
    id: text("id").primaryKey().$defaultFn(createId),
    taskId: text("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    actorUserId: text("actor_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    eventType: text("event_type").notNull(),
    payloadJson: text("payload_json").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(now)
  },
  (table) => [index("task_events_task_id_idx").on(table.taskId)]
);

export type Household = typeof households.$inferSelect;
export type User = typeof users.$inferSelect;
export type Task = typeof tasks.$inferSelect;
export type RecurringTaskTemplate = typeof recurringTaskTemplates.$inferSelect;
export type Label = typeof labels.$inferSelect;
export type ChecklistItem = typeof checklistItems.$inferSelect;
export type Comment = typeof comments.$inferSelect;
export type Attachment = typeof attachments.$inferSelect;
export type RetrospectiveTemplate = typeof retrospectiveTemplates.$inferSelect;
export type RetrospectiveTemplateRound =
  typeof retrospectiveTemplateRounds.$inferSelect;
export type CommitmentPeriod = typeof commitmentPeriods.$inferSelect;
export type Retrospective = typeof retrospectives.$inferSelect;
export type RetrospectiveRound = typeof retrospectiveRounds.$inferSelect;
export type RetrospectiveNote = typeof retrospectiveNotes.$inferSelect;
export type Commitment = typeof commitments.$inferSelect;
export type CommitmentCheckin = typeof commitmentCheckins.$inferSelect;
export type CommitmentChecklistItem =
  typeof commitmentChecklistItems.$inferSelect;
export type CommitmentReview = typeof commitmentReviews.$inferSelect;
export type HouseholdSettings = typeof householdSettings.$inferSelect;
export type TaskEvent = typeof taskEvents.$inferSelect;
