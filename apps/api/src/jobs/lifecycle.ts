import type { Dirent } from "node:fs";
import {
  readdir,
  rm,
  stat
} from "node:fs/promises";
import path from "node:path";
import {
  and,
  eq,
  inArray,
  isNotNull,
  isNull
} from "drizzle-orm";
import type { SwntdConfig } from "@swntd/shared/server/config";
import {
  attachments,
  checklistItems,
  householdSettings,
  recurringTaskTemplateChecklistItems,
  recurringTaskTemplateLabels,
  recurringTaskTemplates,
  taskLabels,
  tasks
} from "@swntd/shared/server/db/schema";
import {
  buildNextOccurrence,
  getTopInsertSortKey,
  shouldArchiveTask,
  shouldGenerateOccurrence
} from "@swntd/shared/server/domain/tasks";
import type { DatabaseClient } from "../db/client";
import { resolveUploadsDir } from "../files/uploads";

type JobContext = {
  config: SwntdConfig;
  db: DatabaseClient;
  now?: Date;
};

export type RecurringOccurrenceJobSummary = {
  checkedTemplates: number;
  copiedChecklistItems: number;
  copiedLabels: number;
  generatedOccurrences: number;
  skippedTemplates: number;
};

export type DoneTaskArchivalJobSummary = {
  archivedTasks: number;
  checkedTasks: number;
};

export type StaleUploadCleanupJobSummary = {
  deletedFiles: number;
  keptRecentFiles: number;
  keptReferencedFiles: number;
  scannedFiles: number;
};

export type LifecycleJobRunSummary = {
  archive: DoneTaskArchivalJobSummary;
  cleanup: StaleUploadCleanupJobSummary;
  recurring: RecurringOccurrenceJobSummary;
  startedAt: string;
};

export async function runRecurringOccurrenceGenerationJob(
  context: JobContext
): Promise<RecurringOccurrenceJobSummary> {
  const now = context.now ?? new Date();
  const summary: RecurringOccurrenceJobSummary = {
    checkedTemplates: 0,
    copiedChecklistItems: 0,
    copiedLabels: 0,
    generatedOccurrences: 0,
    skippedTemplates: 0
  };

  const templateRows = await context.db
    .select({
      householdId: recurringTaskTemplates.householdId,
      id: recurringTaskTemplates.id
    })
    .from(recurringTaskTemplates);

  summary.checkedTemplates = templateRows.length;

  for (const templateRow of templateRows) {
    const [settings] = await context.db
      .select({
        defaultTimezone: householdSettings.defaultTimezone
      })
      .from(householdSettings)
      .where(eq(householdSettings.householdId, templateRow.householdId));

    const nowOn = toTimeZoneDate(
      now,
      settings?.defaultTimezone ?? context.config.defaultTimezone
    );

    const generated = await context.db.transaction(async (tx) => {
      const [template] = await tx
        .select()
        .from(recurringTaskTemplates)
        .where(eq(recurringTaskTemplates.id, templateRow.id));

      if (!template) {
        return null;
      }

      const occurrenceRows = await tx
        .select({
          archivedAt: tasks.archivedAt,
          completedAt: tasks.completedAt,
          createdAt: tasks.createdAt,
          id: tasks.id
        })
        .from(tasks)
        .where(eq(tasks.recurringTaskTemplateId, template.id));

      occurrenceRows.sort(
        (left, right) => right.createdAt.getTime() - left.createdAt.getTime()
      );

      if (
        !shouldGenerateOccurrence({
          template,
          latestOccurrence: occurrenceRows[0] ?? null,
          nowOn
        })
      ) {
        return null;
      }

      const toDoSortKeys = await tx
        .select({
          sortKey: tasks.sortKey
        })
        .from(tasks)
        .where(
          and(
            eq(tasks.householdId, template.householdId),
            eq(tasks.status, "To Do"),
            isNull(tasks.archivedAt)
          )
        );

      const generatedOccurrence = buildNextOccurrence({
        sortKey: getTopInsertSortKey(toDoSortKeys.map((row) => row.sortKey)),
        template
      });

      const [createdTask] = await tx
        .insert(tasks)
        .values({
          aiAssistanceEnabled: generatedOccurrence.occurrence.aiAssistanceEnabled,
          assigneeUserId: generatedOccurrence.occurrence.assigneeUserId,
          createdByUserId: template.updatedByUserId,
          description: generatedOccurrence.occurrence.description,
          dueOn: generatedOccurrence.occurrence.dueOn,
          dueTime: generatedOccurrence.occurrence.dueTime,
          householdId: template.householdId,
          recurringTaskTemplateId: template.id,
          sortKey: generatedOccurrence.occurrence.sortKey,
          status: generatedOccurrence.occurrence.status,
          title: generatedOccurrence.occurrence.title,
          updatedByUserId: template.updatedByUserId
        })
        .returning({
          id: tasks.id
        });

      const createdTaskId = createdTask?.id;

      if (!createdTaskId) {
        throw new Error(`Failed to create recurring task occurrence for template ${template.id}.`);
      }

      const templateChecklistItems = await tx
        .select({
          body: recurringTaskTemplateChecklistItems.body,
          sortOrder: recurringTaskTemplateChecklistItems.sortOrder
        })
        .from(recurringTaskTemplateChecklistItems)
        .where(
          eq(recurringTaskTemplateChecklistItems.recurringTaskTemplateId, template.id)
        );

      if (templateChecklistItems.length > 0) {
        await tx.insert(checklistItems).values(
          templateChecklistItems.map((item) => ({
            body: item.body,
            sortOrder: item.sortOrder,
            taskId: createdTaskId
          }))
        );
      }

      const templateLabelRows = await tx
        .select({
          labelId: recurringTaskTemplateLabels.labelId
        })
        .from(recurringTaskTemplateLabels)
        .where(eq(recurringTaskTemplateLabels.recurringTaskTemplateId, template.id));

      if (templateLabelRows.length > 0) {
        await tx.insert(taskLabels).values(
          templateLabelRows.map((row) => ({
            labelId: row.labelId,
            taskId: createdTaskId
          }))
        );
      }

      await tx
        .update(recurringTaskTemplates)
        .set({
          nextOccurrenceOn: generatedOccurrence.nextOccurrenceOn,
          updatedAt: now
        })
        .where(eq(recurringTaskTemplates.id, template.id));

      return {
        checklistItemsCopied: templateChecklistItems.length,
        labelsCopied: templateLabelRows.length
      };
    });

    if (!generated) {
      summary.skippedTemplates += 1;
      continue;
    }

    summary.generatedOccurrences += 1;
    summary.copiedChecklistItems += generated.checklistItemsCopied;
    summary.copiedLabels += generated.labelsCopied;
  }

  return summary;
}

export async function runDoneTaskArchivalJob(
  context: JobContext
): Promise<DoneTaskArchivalJobSummary> {
  const now = context.now ?? new Date();
  const summary: DoneTaskArchivalJobSummary = {
    archivedTasks: 0,
    checkedTasks: 0
  };

  const settingsRows = await context.db
    .select()
    .from(householdSettings);
  const settingsByHouseholdId = new Map(
    settingsRows.map((row) => [row.householdId, row])
  );

  const candidateTasks = await context.db
    .select({
      archivedAt: tasks.archivedAt,
      completedAt: tasks.completedAt,
      createdAt: tasks.createdAt,
      householdId: tasks.householdId,
      id: tasks.id,
      recurringTaskTemplateId: tasks.recurringTaskTemplateId
    })
    .from(tasks)
    .where(and(isNull(tasks.archivedAt), isNotNull(tasks.completedAt)));

  summary.checkedTasks = candidateTasks.length;

  const recurringByTemplateId = new Map<
    string,
    Array<{
      createdAt: Date;
      id: string;
    }>
  >();

  const recurringOccurrences = await context.db
    .select({
      createdAt: tasks.createdAt,
      id: tasks.id,
      recurringTaskTemplateId: tasks.recurringTaskTemplateId
    })
    .from(tasks)
    .where(isNotNull(tasks.recurringTaskTemplateId));

  for (const task of recurringOccurrences) {
    if (!task.recurringTaskTemplateId) {
      continue;
    }

    const existing = recurringByTemplateId.get(task.recurringTaskTemplateId) ?? [];
    existing.push({
      createdAt: task.createdAt,
      id: task.id
    });
    recurringByTemplateId.set(task.recurringTaskTemplateId, existing);
  }

  for (const occurrences of recurringByTemplateId.values()) {
    occurrences.sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime());
  }

  const archiveIds: string[] = [];

  for (const task of candidateTasks) {
    const settings = settingsByHouseholdId.get(task.householdId);
    const successorGeneratedAt = task.recurringTaskTemplateId
      ? getSuccessorGeneratedAt(
          recurringByTemplateId.get(task.recurringTaskTemplateId) ?? [],
          task.id
        )
      : null;

    const retentionDays =
      settings?.doneArchiveAfterDays ?? context.config.doneArchiveAfterDays;

    if (
      shouldArchiveTask({
        completedAt: task.completedAt,
        isRecurringOccurrence: task.recurringTaskTemplateId !== null,
        now,
        retentionDays,
        successorGeneratedAt
      })
    ) {
      archiveIds.push(task.id);
    }
  }

  if (archiveIds.length > 0) {
    await context.db
      .update(tasks)
      .set({
        archivedAt: now,
        updatedAt: now
      })
      .where(inArray(tasks.id, archiveIds));
  }

  summary.archivedTasks = archiveIds.length;

  return summary;
}

export async function runStaleUploadCleanupJob(
  context: JobContext
): Promise<StaleUploadCleanupJobSummary> {
  const now = context.now ?? new Date();
  const summary: StaleUploadCleanupJobSummary = {
    deletedFiles: 0,
    keptRecentFiles: 0,
    keptReferencedFiles: 0,
    scannedFiles: 0
  };
  const uploadsDir = resolveUploadsDir({
    maxUploadBytes: context.config.maxUploadBytes,
    uploadsDir: context.config.uploadsDir
  });
  const cutoffMs =
    now.getTime() - context.config.staleUploadGraceHours * 60 * 60 * 1000;

  const referencedRows = await context.db
    .select({
      storagePath: attachments.storagePath
    })
    .from(attachments)
    .where(
      and(
        eq(attachments.storageKind, "upload"),
        isNotNull(attachments.storagePath)
      )
    );
  const referencedPaths = new Set(
    referencedRows.flatMap((row) => (row.storagePath ? [row.storagePath] : []))
  );

  let directoryEntries: Dirent<string>[];

  try {
    directoryEntries = await readdir(uploadsDir, {
      withFileTypes: true
    });
  } catch (error) {
    if (isMissingDirectoryError(error)) {
      return summary;
    }

    throw error;
  }

  for (const entry of directoryEntries) {
    if (!entry.isFile()) {
      continue;
    }

    summary.scannedFiles += 1;

    if (referencedPaths.has(entry.name)) {
      summary.keptReferencedFiles += 1;
      continue;
    }

    const absolutePath = path.join(uploadsDir, entry.name);
    const fileStats = await stat(absolutePath);

    if (fileStats.mtimeMs > cutoffMs) {
      summary.keptRecentFiles += 1;
      continue;
    }

    await rm(absolutePath, { force: true });
    summary.deletedFiles += 1;
  }

  return summary;
}

export async function runAllLifecycleJobs(
  context: JobContext
): Promise<LifecycleJobRunSummary> {
  const startedAt = (context.now ?? new Date()).toISOString();

  const recurring = await runRecurringOccurrenceGenerationJob(context);
  const archive = await runDoneTaskArchivalJob(context);
  const cleanup = await runStaleUploadCleanupJob(context);

  return {
    archive,
    cleanup,
    recurring,
    startedAt
  };
}

function getSuccessorGeneratedAt(
  occurrences: Array<{
    createdAt: Date;
    id: string;
  }>,
  taskId: string
) {
  const currentIndex = occurrences.findIndex((occurrence) => occurrence.id === taskId);

  if (currentIndex === -1) {
    return null;
  }

  return occurrences[currentIndex + 1]?.createdAt ?? null;
}

function isMissingDirectoryError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}

function toTimeZoneDate(value: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone,
    year: "numeric"
  }).formatToParts(value);

  const getPart = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";

  return `${getPart("year")}-${getPart("month")}-${getPart("day")}`;
}
