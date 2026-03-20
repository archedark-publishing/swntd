import type { Context } from "hono";
import { Hono } from "hono";
import { z } from "zod";
import { taskStatuses } from "@swntd/shared/server/domain/tasks";
import type { AuthenticatedActor } from "@swntd/shared/server/domain/authorization";
import type { DatabaseClient } from "./db/client";
import { createDatabase } from "./db/client";
import { ApiError, toApiError } from "./http/errors";
import {
  isoDateSchema,
  optionalIsoDateSchema,
  optionalTimeSchema,
  parseJsonBody,
  parseQuery,
  timeSchema
} from "./http/validation";
import { resolveRequestActor } from "./auth/resolve-actor";
import {
  addAttachmentLinkToTask,
  addCommentToTask,
  addUploadToTask,
  archiveTask,
  createHouseholdUser,
  createLabel,
  createRecurringTemplate,
  createTask,
  getCurrentActor,
  getRecurringTemplate,
  getSettings,
  getTaskAttachmentDownload,
  getTaskDetail,
  issueServiceTokenForUser,
  listHouseholdUsers,
  listLabels,
  listRecurringTemplates,
  listServiceTokensForUser,
  listTasks,
  removeHouseholdUser,
  reorderTask,
  revokeServiceToken,
  transitionTask,
  unarchiveTask,
  updateHouseholdUser,
  updateRecurringTemplate,
  updateSettings,
  updateTask
} from "./services/api";
import { deleteStoredUpload, readStoredUpload, storeUpload } from "./files/uploads";

type JsonStatus = 200 | 201 | 400 | 401 | 403 | 404 | 409 | 413 | 415 | 500;

type AppVariables = {
  actor: AuthenticatedActor;
  config: Awaited<ReturnType<typeof createDatabase>>["config"];
  db: DatabaseClient;
};

const taskStatusSchema = z.enum(taskStatuses);
const booleanQuerySchema = z.enum(["true", "false"]).transform((value) => value === "true");

const taskBaseSchema = z.object({
  aiAssistanceEnabled: z.boolean().optional(),
  assigneeUserId: z.string().trim().min(1).nullable().optional(),
  checklistItems: z
    .array(
      z.object({
        body: z.string().trim().min(1),
        isCompleted: z.boolean().optional()
      })
    )
    .optional(),
  description: z.string().optional(),
  dueOn: optionalIsoDateSchema,
  dueTime: optionalTimeSchema,
  labelIds: z.array(z.string().trim().min(1)).optional(),
  title: z.string().trim().min(1)
});

const updateTaskSchema = taskBaseSchema.extend({
  expectedRevision: z.number().int().nonnegative()
});

const transitionTaskSchema = z.object({
  expectedRevision: z.number().int().nonnegative(),
  status: taskStatusSchema
});

const reorderTaskSchema = z.object({
  expectedRevision: z.number().int().nonnegative(),
  targetIndex: z.number().int().nonnegative()
});

const commentSchema = z.object({
  body: z.string().trim().min(1)
});

const attachmentLinkSchema = z.object({
  name: z.string().trim().min(1),
  url: z.url()
});

const labelSchema = z.object({
  color: z.string().trim().min(1).nullable().optional(),
  name: z.string().trim().min(1)
});

const createHouseholdUserSchema = z.discriminatedUnion("role", [
  z.object({
    displayName: z.string().trim().min(1),
    email: z.email(),
    role: z.literal("admin")
  }),
  z.object({
    displayName: z.string().trim().min(1),
    role: z.literal("service"),
    serviceKind: z.string().trim().min(1)
  })
]);

const updateHouseholdUserSchema = z
  .object({
    displayName: z.string().trim().min(1).optional(),
    email: z.email().nullable().optional(),
    serviceKind: z.string().trim().min(1).optional()
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one user field must be updated."
  });

const issueServiceTokenSchema = z.object({
  name: z.string().trim().min(1)
});

const settingsSchema = z
  .object({
    defaultCalendarExportKind: z.enum(["google", "ics"]).optional(),
    defaultTimezone: z.string().trim().min(1).optional(),
    doneArchiveAfterDays: z.number().int().positive().optional()
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one setting must be updated."
  });

const recurringTemplateSchema = z.object({
  aiAssistanceEnabledDefault: z.boolean().optional(),
  checklistItems: z
    .array(
      z.object({
        body: z.string().trim().min(1)
      })
    )
    .optional(),
  defaultAssigneeUserId: z.string().trim().min(1).nullable().optional(),
  defaultDueTime: timeSchema.nullable().optional(),
  description: z.string().optional(),
  isActive: z.boolean().optional(),
  labelIds: z.array(z.string().trim().min(1)).optional(),
  nextOccurrenceOn: isoDateSchema,
  recurrenceCadence: z.enum(["daily", "weekly", "monthly"]),
  recurrenceInterval: z.number().int().positive(),
  title: z.string().trim().min(1)
});

const archiveSchema = z.object({
  expectedRevision: z.number().int().nonnegative()
});

const taskListQuerySchema = z.object({
  archived: z.enum(["exclude", "include", "only"]).default("exclude"),
  assigneeUserId: z.string().trim().min(1).optional(),
  labelId: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().positive().max(200).default(100),
  offset: z.coerce.number().int().nonnegative().default(0),
  query: z.string().trim().min(1).optional(),
  recurring: booleanQuerySchema.optional(),
  status: taskStatusSchema.optional()
});

function getAuthFailureError(
  c: Context<{ Variables: AppVariables }>,
  headers: Record<string, string | undefined>
) {
  const mode = c.var.config.authMode;

  if (headers.authorization) {
    return new ApiError(401, "unauthorized", "Invalid or expired service token.");
  }

  if (mode === "trusted_header" && headers["x-exedev-email"]) {
    return new ApiError(
      403,
      "forbidden",
      "Authenticated user is not a member of this household."
    );
  }

  if (mode === "local_dev" && headers["x-swntd-dev-email"]) {
    return new ApiError(
      403,
      "forbidden",
      "Development actor is not a member of this household."
    );
  }

  return new ApiError(401, "unauthorized", "Authentication required.");
}

function headersToObject(c: Context) {
  return Object.fromEntries(c.req.raw.headers.entries());
}

function jsonOk<T>(c: Context, payload: T, status: 200 | 201 = 200) {
  return c.json(payload, status);
}

export function createApp() {
  const app = new Hono<{ Variables: AppVariables }>();

  app.onError((error, c) => {
    const apiError = toApiError(error);

    return c.json(
      {
        error: {
          code: apiError.code,
          details: apiError.details ?? null,
          message: apiError.message
        }
      },
      apiError.status as JsonStatus
    );
  });

  app.notFound((c) =>
    c.json(
      {
        error: {
          code: "not_found",
          details: null,
          message: "Route not found."
        }
      },
      404 as const
    )
  );

  app.use("/api/*", async (c, next) => {
    const database = await createDatabase();

    c.set("config", database.config);
    c.set("db", database.db);

    try {
      await next();
    } finally {
      database.client.close();
    }
  });

  app.use("/api/*", async (c, next) => {
    const headers = headersToObject(c);
    const actor = await resolveRequestActor(
      {
        headers,
        trustedProxy: c.var.config.authMode === "trusted_header"
      },
      c.var.db
    );

    if (!actor) {
      throw getAuthFailureError(c, headers);
    }

    c.set("actor", actor);
    await next();
  });

  app.get("/api/v1/me", async (c) =>
    jsonOk(c, await getCurrentActor(c.var.actor))
  );

  app.get("/api/v1/users", async (c) =>
    jsonOk(c, await listHouseholdUsers(c.var.db, c.var.actor))
  );

  app.post("/api/v1/users", async (c) => {
    const input = await parseJsonBody(c, createHouseholdUserSchema);

    return jsonOk(c, await createHouseholdUser(c.var.db, c.var.actor, input), 201);
  });

  app.patch("/api/v1/users/:userId", async (c) => {
    const input = await parseJsonBody(c, updateHouseholdUserSchema);

    return jsonOk(
      c,
      await updateHouseholdUser(c.var.db, c.var.actor, c.req.param("userId"), input)
    );
  });

  app.post("/api/v1/users/:userId/remove", async (c) =>
    jsonOk(
      c,
      await removeHouseholdUser(c.var.db, c.var.actor, c.req.param("userId"))
    )
  );

  app.get("/api/v1/users/:userId/service-tokens", async (c) =>
    jsonOk(
      c,
      await listServiceTokensForUser(c.var.db, c.var.actor, c.req.param("userId"))
    )
  );

  app.post("/api/v1/users/:userId/service-tokens", async (c) => {
    const input = await parseJsonBody(c, issueServiceTokenSchema);

    return jsonOk(
      c,
      await issueServiceTokenForUser(
        c.var.db,
        c.var.actor,
        c.req.param("userId"),
        input
      ),
      201
    );
  });

  app.post("/api/v1/service-tokens/:tokenId/revoke", async (c) =>
    jsonOk(
      c,
      await revokeServiceToken(c.var.db, c.var.actor, c.req.param("tokenId"))
    )
  );

  app.get("/api/v1/settings", async (c) =>
    jsonOk(c, await getSettings(c.var.db, c.var.actor))
  );

  app.patch("/api/v1/settings", async (c) => {
    const input = await parseJsonBody(c, settingsSchema);

    return jsonOk(c, await updateSettings(c.var.db, c.var.actor, input));
  });

  app.get("/api/v1/labels", async (c) =>
    jsonOk(c, await listLabels(c.var.db, c.var.actor))
  );

  app.post("/api/v1/labels", async (c) => {
    const input = await parseJsonBody(c, labelSchema);

    return jsonOk(c, await createLabel(c.var.db, c.var.actor, input), 201);
  });

  app.get("/api/v1/recurring-templates", async (c) =>
    jsonOk(c, await listRecurringTemplates(c.var.db, c.var.actor))
  );

  app.post("/api/v1/recurring-templates", async (c) => {
    const input = await parseJsonBody(c, recurringTemplateSchema);

    return jsonOk(
      c,
      await createRecurringTemplate(c.var.db, c.var.actor, input),
      201
    );
  });

  app.get("/api/v1/recurring-templates/:templateId", async (c) =>
    jsonOk(
      c,
      await getRecurringTemplate(c.var.db, c.var.actor, c.req.param("templateId"))
    )
  );

  app.patch("/api/v1/recurring-templates/:templateId", async (c) => {
    const input = await parseJsonBody(c, recurringTemplateSchema);

    return jsonOk(
      c,
      await updateRecurringTemplate(
        c.var.db,
        c.var.actor,
        c.req.param("templateId"),
        input
      )
    );
  });

  app.get("/api/v1/tasks", async (c) => {
    const query = parseQuery(c, taskListQuerySchema);

    return jsonOk(c, await listTasks(c.var.db, c.var.actor, query));
  });

  app.post("/api/v1/tasks", async (c) => {
    const input = await parseJsonBody(c, taskBaseSchema);

    return jsonOk(c, await createTask(c.var.db, c.var.actor, input), 201);
  });

  app.get("/api/v1/tasks/:taskId", async (c) =>
    jsonOk(c, await getTaskDetail(c.var.db, c.var.actor, c.req.param("taskId")))
  );

  app.patch("/api/v1/tasks/:taskId", async (c) => {
    const input = await parseJsonBody(c, updateTaskSchema);

    return jsonOk(
      c,
      await updateTask(c.var.db, c.var.actor, c.req.param("taskId"), input)
    );
  });

  app.post("/api/v1/tasks/:taskId/status", async (c) => {
    const input = await parseJsonBody(c, transitionTaskSchema);

    return jsonOk(
      c,
      await transitionTask(c.var.db, c.var.actor, c.req.param("taskId"), input)
    );
  });

  app.post("/api/v1/tasks/:taskId/reorder", async (c) => {
    const input = await parseJsonBody(c, reorderTaskSchema);

    return jsonOk(
      c,
      await reorderTask(c.var.db, c.var.actor, c.req.param("taskId"), input)
    );
  });

  app.post("/api/v1/tasks/:taskId/comments", async (c) => {
    const input = await parseJsonBody(c, commentSchema);

    return jsonOk(
      c,
      await addCommentToTask(c.var.db, c.var.actor, c.req.param("taskId"), input),
      201
    );
  });

  app.post("/api/v1/tasks/:taskId/attachment-links", async (c) => {
    const input = await parseJsonBody(c, attachmentLinkSchema);

    return jsonOk(
      c,
      await addAttachmentLinkToTask(
        c.var.db,
        c.var.actor,
        c.req.param("taskId"),
        input
      ),
      201
    );
  });

  app.post("/api/v1/tasks/:taskId/uploads", async (c) => {
    const formData = await c.req.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      throw new ApiError(400, "missing_upload", "A file field is required.");
    }

    const storedUpload = await storeUpload(file, c.var.config);

    try {
      const response = await addUploadToTask(
        c.var.db,
        c.var.actor,
        c.req.param("taskId"),
        storedUpload
      );

      return jsonOk(c, response, 201);
    } catch (error) {
      await deleteStoredUpload(storedUpload.storagePath, c.var.config);
      throw error;
    }
  });

  app.get("/api/v1/tasks/:taskId/attachments/:attachmentId/download", async (c) => {
    const { attachment } = await getTaskAttachmentDownload(
      c.var.db,
      c.var.actor,
      c.req.param("taskId"),
      c.req.param("attachmentId")
    );
    const body = await readStoredUpload(attachment.storagePath!, c.var.config);

    c.header(
      "Content-Disposition",
      `attachment; filename="${attachment.originalName.replaceAll("\"", "")}"`
    );
    c.header(
      "Content-Type",
      attachment.mimeType ?? "application/octet-stream"
    );

    return c.body(body);
  });

  app.post("/api/v1/tasks/:taskId/archive", async (c) => {
    const input = await parseJsonBody(c, archiveSchema);

    return jsonOk(
      c,
      await archiveTask(
        c.var.db,
        c.var.actor,
        c.req.param("taskId"),
        input.expectedRevision
      )
    );
  });

  app.post("/api/v1/tasks/:taskId/unarchive", async (c) => {
    const input = await parseJsonBody(c, archiveSchema);

    return jsonOk(
      c,
      await unarchiveTask(
        c.var.db,
        c.var.actor,
        c.req.param("taskId"),
        input.expectedRevision
      )
    );
  });

  app.get("/api/v1/openapi.json", (c) =>
    jsonOk(c, {
      openapi: "3.1.0",
      paths: {
        "/api/v1/labels": ["get", "post"],
        "/api/v1/me": ["get"],
        "/api/v1/recurring-templates": ["get", "post"],
        "/api/v1/recurring-templates/{templateId}": ["get", "patch"],
        "/api/v1/settings": ["get", "patch"],
        "/api/v1/tasks": ["get", "post"],
        "/api/v1/tasks/{taskId}": ["get", "patch"],
        "/api/v1/tasks/{taskId}/archive": ["post"],
        "/api/v1/tasks/{taskId}/attachment-links": ["post"],
        "/api/v1/tasks/{taskId}/attachments/{attachmentId}/download": ["get"],
        "/api/v1/tasks/{taskId}/comments": ["post"],
        "/api/v1/tasks/{taskId}/reorder": ["post"],
        "/api/v1/tasks/{taskId}/status": ["post"],
        "/api/v1/tasks/{taskId}/unarchive": ["post"],
        "/api/v1/tasks/{taskId}/uploads": ["post"],
        "/api/v1/users": ["get", "post"],
        "/api/v1/users/{userId}": ["patch"],
        "/api/v1/users/{userId}/remove": ["post"],
        "/api/v1/users/{userId}/service-tokens": ["get", "post"],
        "/api/v1/service-tokens/{tokenId}/revoke": ["post"]
      }
    })
  );

  return app;
}
