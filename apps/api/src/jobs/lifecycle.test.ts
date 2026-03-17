import {
  access,
  mkdir,
  utimes,
  writeFile
} from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  attachments,
  checklistItems,
  labels,
  recurringTaskTemplateChecklistItems,
  recurringTaskTemplateLabels,
  recurringTaskTemplates,
  taskLabels,
  tasks,
  users
} from "@swntd/shared/server/db/schema";
import { getApiConfig } from "../config";
import { createDatabase } from "../db/client";
import {
  setupApiTestEnvironment,
  teardownApiTestEnvironment
} from "../test-support";
import {
  runDoneTaskArchivalJob,
  runRecurringOccurrenceGenerationJob,
  runStaleUploadCleanupJob
} from "./lifecycle";

describe("Phase 5 lifecycle jobs", () => {
  let uploadsDir: string;

  beforeEach(async () => {
    const environment = await setupApiTestEnvironment();

    uploadsDir = environment.uploadsDir;
  });

  afterEach(async () => {
    await teardownApiTestEnvironment(uploadsDir);
  });

  it("generates one recurring occurrence at a time and copies template metadata", async () => {
    const { client, db } = await createDatabase();

    try {
      const seedUsers = await getSeedUsers(db);

      const [rawLabel] = await db
        .insert(labels)
        .values({
          color: "#b86",
          householdId: "default-household",
          name: "Weekly"
        })
        .returning({
          id: labels.id
        });

      const label = getRequiredRow(rawLabel, "Expected label to be created.");

      const [rawTemplate] = await db
        .insert(recurringTaskTemplates)
        .values({
          aiAssistanceEnabledDefault: true,
          createdByUserId: seedUsers.admin.id,
          defaultAssigneeUserId: seedUsers.assistant.id,
          defaultDueTime: "09:00",
          description: "Take the bins out before lunch.",
          householdId: "default-household",
          nextOccurrenceOn: "2026-03-17",
          recurrenceCadence: "weekly",
          recurrenceInterval: 1,
          title: "Take out the trash",
          updatedByUserId: seedUsers.admin.id
        })
        .returning({
          id: recurringTaskTemplates.id
        });
      const template = getRequiredRow(rawTemplate, "Expected recurring template to be created.");

      await db.insert(recurringTaskTemplateChecklistItems).values([
        {
          body: "Empty kitchen bin",
          recurringTaskTemplateId: template.id,
          sortOrder: 0
        },
        {
          body: "Take recycling outside",
          recurringTaskTemplateId: template.id,
          sortOrder: 1
        }
      ]);

      await db.insert(recurringTaskTemplateLabels).values({
        labelId: label.id,
        recurringTaskTemplateId: template.id
      });

      const firstRun = await runRecurringOccurrenceGenerationJob({
        config: getApiConfig(),
        db,
        now: new Date("2026-03-17T14:00:00.000Z")
      });

      expect(firstRun.generatedOccurrences).toBe(1);
      expect(firstRun.copiedChecklistItems).toBe(2);
      expect(firstRun.copiedLabels).toBe(1);

      const generatedTasks = await db
        .select()
        .from(tasks)
        .where(eq(tasks.recurringTaskTemplateId, template.id));
      const generatedTask = getRequiredRow(
        generatedTasks[0],
        "Expected a recurring task occurrence to be created."
      );

      expect(generatedTasks).toHaveLength(1);
      expect(generatedTask.title).toBe("Take out the trash");
      expect(generatedTask.status).toBe("To Do");
      expect(generatedTask.assigneeUserId).toBe(seedUsers.assistant.id);
      expect(generatedTask.aiAssistanceEnabled).toBe(true);
      expect(generatedTask.dueOn).toBe("2026-03-17");

      const copiedChecklistItems = await db
        .select()
        .from(checklistItems)
        .where(eq(checklistItems.taskId, generatedTask.id));
      expect(copiedChecklistItems).toHaveLength(2);

      const copiedLabels = await db
        .select()
        .from(taskLabels)
        .where(eq(taskLabels.taskId, generatedTask.id));
      expect(copiedLabels).toHaveLength(1);

      const [updatedTemplate] = await db
        .select({
          nextOccurrenceOn: recurringTaskTemplates.nextOccurrenceOn
        })
        .from(recurringTaskTemplates)
        .where(eq(recurringTaskTemplates.id, template.id));
      expect(updatedTemplate?.nextOccurrenceOn).toBe("2026-03-24");

      const secondRun = await runRecurringOccurrenceGenerationJob({
        config: getApiConfig(),
        db,
        now: new Date("2026-03-17T15:00:00.000Z")
      });

      expect(secondRun.generatedOccurrences).toBe(0);

      const tasksAfterSecondRun = await db
        .select({
          id: tasks.id
        })
        .from(tasks)
        .where(eq(tasks.recurringTaskTemplateId, template.id));
      expect(tasksAfterSecondRun).toHaveLength(1);
    } finally {
      client.close();
    }
  });

  it("archives overdue one-off tasks and completed recurring predecessors", async () => {
    const { client, db } = await createDatabase();

    try {
      const seedUsers = await getSeedUsers(db);

      const [rawTemplate] = await db
        .insert(recurringTaskTemplates)
        .values({
          createdByUserId: seedUsers.admin.id,
          defaultAssigneeUserId: null,
          description: "",
          householdId: "default-household",
          nextOccurrenceOn: "2026-03-24",
          recurrenceCadence: "weekly",
          recurrenceInterval: 1,
          title: "Water plants",
          updatedByUserId: seedUsers.admin.id
        })
        .returning({
          id: recurringTaskTemplates.id
        });
      const template = getRequiredRow(rawTemplate, "Expected recurring template to be created.");

      const [rawOverdueTask] = await db
        .insert(tasks)
        .values({
          completedAt: new Date("2026-02-10T12:00:00.000Z"),
          createdByUserId: seedUsers.admin.id,
          householdId: "default-household",
          status: "Done",
          title: "Mail package",
          updatedByUserId: seedUsers.admin.id
        })
        .returning({
          id: tasks.id
        });
      const overdueTask = getRequiredRow(rawOverdueTask, "Expected overdue task to be created.");

      const [rawFreshTask] = await db
        .insert(tasks)
        .values({
          completedAt: new Date("2026-03-10T12:00:00.000Z"),
          createdByUserId: seedUsers.admin.id,
          householdId: "default-household",
          status: "Done",
          title: "Pick up prescription",
          updatedByUserId: seedUsers.admin.id
        })
        .returning({
          id: tasks.id
        });
      const freshTask = getRequiredRow(rawFreshTask, "Expected fresh task to be created.");

      const [rawRecurringPredecessor] = await db
        .insert(tasks)
        .values({
          completedAt: new Date("2026-03-15T11:00:00.000Z"),
          createdAt: new Date("2026-03-15T10:00:00.000Z"),
          createdByUserId: seedUsers.admin.id,
          householdId: "default-household",
          recurringTaskTemplateId: template.id,
          status: "Done",
          title: "Water plants",
          updatedAt: new Date("2026-03-15T11:00:00.000Z"),
          updatedByUserId: seedUsers.admin.id
        })
        .returning({
          id: tasks.id
        });
      const recurringPredecessor = getRequiredRow(
        rawRecurringPredecessor,
        "Expected recurring predecessor task to be created."
      );

      await db.insert(tasks).values({
        createdAt: new Date("2026-03-16T08:00:00.000Z"),
        createdByUserId: seedUsers.admin.id,
        householdId: "default-household",
        recurringTaskTemplateId: template.id,
        status: "To Do",
        title: "Water plants",
        updatedAt: new Date("2026-03-16T08:00:00.000Z"),
        updatedByUserId: seedUsers.admin.id
      });

      const summary = await runDoneTaskArchivalJob({
        config: getApiConfig(),
        db,
        now: new Date("2026-03-17T14:00:00.000Z")
      });

      expect(summary.checkedTasks).toBe(3);
      expect(summary.archivedTasks).toBe(2);

      const archivedRows = await db
        .select({
          archivedAt: tasks.archivedAt,
          id: tasks.id
        })
        .from(tasks)
        .where(eq(tasks.status, "Done"));

      const archivedById = new Map(archivedRows.map((row) => [row.id, row.archivedAt]));

      expect(archivedById.get(overdueTask.id)).toBeTruthy();
      expect(archivedById.get(recurringPredecessor.id)).toBeTruthy();
      expect(archivedById.get(freshTask.id)).toBeNull();
    } finally {
      client.close();
    }
  });

  it("removes only orphaned uploads older than the cleanup grace period", async () => {
    const { client, db } = await createDatabase();

    try {
      process.env.SWNTD_STALE_UPLOAD_GRACE_HOURS = "24";

      const seedUsers = await getSeedUsers(db);

      const [rawTask] = await db
        .insert(tasks)
        .values({
          createdByUserId: seedUsers.admin.id,
          householdId: "default-household",
          title: "Reference upload",
          updatedByUserId: seedUsers.admin.id
        })
        .returning({
          id: tasks.id
        });
      const task = getRequiredRow(rawTask, "Expected attachment task to be created.");

      await db.insert(attachments).values({
        originalName: "referenced.txt",
        storageKind: "upload",
        storagePath: "referenced.txt",
        taskId: task.id,
        uploadedByUserId: seedUsers.admin.id
      });

      await mkdir(uploadsDir, { recursive: true });

      const referencedPath = path.join(uploadsDir, "referenced.txt");
      const orphanOldPath = path.join(uploadsDir, "orphan-old.txt");
      const orphanRecentPath = path.join(uploadsDir, "orphan-recent.txt");

      await writeFile(referencedPath, "keep");
      await writeFile(orphanOldPath, "delete");
      await writeFile(orphanRecentPath, "keep for now");

      const oldTimestamp = new Date("2026-03-15T10:00:00.000Z");
      const recentTimestamp = new Date("2026-03-17T13:30:00.000Z");

      await utimes(referencedPath, oldTimestamp, oldTimestamp);
      await utimes(orphanOldPath, oldTimestamp, oldTimestamp);
      await utimes(orphanRecentPath, recentTimestamp, recentTimestamp);

      const summary = await runStaleUploadCleanupJob({
        config: getApiConfig(),
        db,
        now: new Date("2026-03-17T14:00:00.000Z")
      });

      expect(summary.scannedFiles).toBe(3);
      expect(summary.deletedFiles).toBe(1);
      expect(summary.keptReferencedFiles).toBe(1);
      expect(summary.keptRecentFiles).toBe(1);

      await expect(fileExists(referencedPath)).resolves.toBe(true);
      await expect(fileExists(orphanOldPath)).resolves.toBe(false);
      await expect(fileExists(orphanRecentPath)).resolves.toBe(true);
    } finally {
      client.close();
    }
  });
});

async function fileExists(filePath: string) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function getRequiredRow<T>(row: T | undefined, message: string) {
  if (!row) {
    throw new Error(message);
  }

  return row;
}

async function getSeedUsers(db: Awaited<ReturnType<typeof createDatabase>>["db"]) {
  const rows = await db
    .select({
      email: users.email,
      id: users.id,
      serviceKind: users.serviceKind
    })
    .from(users);

  const admin = rows.find((row) => row.email === "admin1@example.com");
  const assistant = rows.find((row) => row.serviceKind === "assistant");

  if (!admin || !assistant) {
    throw new Error("Seed users were not available for lifecycle tests.");
  }

  return {
    admin,
    assistant
  };
}
