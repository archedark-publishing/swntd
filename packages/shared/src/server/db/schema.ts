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

export const householdSettings = sqliteTable("household_settings", {
  householdId: text("household_id")
    .primaryKey()
    .references(() => households.id, { onDelete: "cascade" }),
  doneArchiveAfterDays: integer("done_archive_after_days").notNull().default(30),
  defaultTimezone: text("default_timezone").notNull(),
  defaultCalendarExportKind: text("default_calendar_export_kind", {
    enum: ["google", "ics"]
  })
    .notNull()
    .default("google"),
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
export type HouseholdSettings = typeof householdSettings.$inferSelect;
export type TaskEvent = typeof taskEvents.$inferSelect;
