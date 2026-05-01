import type { Context } from "hono";
import { Hono } from "hono";
import { z } from "zod";
import { taskStatuses } from "@swntd/shared/server/domain/tasks";
import {
  commitmentStatuses,
  commitmentReviewRatings,
  commitmentTrackingIntervals,
  commitmentTrackingKinds,
  finalizedRetrospectiveEditPolicies,
  retrospectiveNoteEntryPhases,
  retrospectiveNoteWriteEntryPhases,
  retrospectiveCadences,
  retrospectiveRoundKinds,
  retrospectiveStatuses
} from "@swntd/shared/server/domain/retrospectives";
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
  addChecklistItemToTask,
  addCommentToTask,
  addUploadToTask,
  archiveTask,
  completeRetrospectiveRound,
  createCommitment,
  createCommitmentCheckin,
  createCommitmentReview,
  createHouseholdUser,
  createLabel,
  createRecurringTemplate,
  createRetrospective,
  createRetrospectiveNote,
  createRetrospectiveTemplate,
  createTask,
  claimBootstrapOwnership,
  deleteArchivedTask,
  deleteChecklistItemFromTask,
  deleteCommitmentCheckin,
  deleteLabel,
  deleteRetrospectiveNote,
  getBootstrapContext,
  getCurrentActor,
  getRecurringTemplate,
  getRetrospectiveDetail,
  getRetrospectiveHome,
  getSettings,
  getTaskAttachmentDownload,
  getTaskDetail,
  issueServiceTokenForUser,
  listCommitments,
  listHouseholdUsers,
  listLabels,
  listRecurringTemplates,
  listRetrospectiveNotes,
  listRetrospectives,
  listRetrospectiveTemplates,
  listServiceTokensForUser,
  listTasks,
  removeHouseholdUser,
  reorderTask,
  revokeServiceToken,
  setChecklistItemCompletion,
  enterRetrospectiveRound,
  finalizeRetrospective,
  startRetrospective,
  transitionTask,
  unarchiveTask,
  updateCommitment,
  updateCommitmentReview,
  updateLabel,
  updateRetrospectiveNote,
  updateRetrospectiveTemplate,
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

const addChecklistItemSchema = z.object({
  body: z.string().trim().min(1),
  expectedRevision: z.number().int().nonnegative()
});

const setChecklistItemCompletionSchema = z.object({
  expectedRevision: z.number().int().nonnegative(),
  isCompleted: z.boolean()
});

const deleteChecklistItemSchema = z.object({
  expectedRevision: z.number().int().nonnegative()
});

const attachmentLinkSchema = z.object({
  name: z.string().trim().min(1),
  url: z.url()
});

const labelSchema = z.object({
  color: z.string().trim().min(1).nullable().optional(),
  name: z.string().trim().min(1).max(16)
});
const updateLabelSchema = z
  .object({
    color: z.string().trim().min(1).nullable().optional(),
    name: z.string().trim().min(1).max(16).optional()
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one label field must be updated."
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
    defaultRetrospectiveTemplateId: z.string().trim().min(1).nullable().optional(),
    defaultTimezone: z.string().trim().min(1).optional(),
    doneArchiveAfterDays: z.number().int().positive().optional(),
    finalizedRetrospectiveEditPolicy: z
      .enum(finalizedRetrospectiveEditPolicies)
      .optional(),
    nearDueThresholdDays: z.number().int().positive().optional(),
    retrospectiveCadence: z.enum(retrospectiveCadences).optional(),
    retrospectiveCadenceInterval: z.number().int().positive().optional()
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

const retrospectiveStatusSchema = z.enum(retrospectiveStatuses);
const commitmentStatusSchema = z.enum(commitmentStatuses);
const commitmentTrackingKindSchema = z.enum(commitmentTrackingKinds);
const commitmentTrackingIntervalSchema = z.enum(commitmentTrackingIntervals);
const commitmentReviewRatingSchema = z.enum(commitmentReviewRatings);
const retrospectiveTemplateRoundKindSchema = z.enum(retrospectiveRoundKinds);
const retrospectiveNoteEntryPhaseSchema = z.enum(retrospectiveNoteEntryPhases);
const retrospectivePrivacySchema = z.enum([
  "shared",
  "private_until_round",
  "private"
]);
const retrospectiveNoteWriteEntryPhaseSchema = z.enum(
  retrospectiveNoteWriteEntryPhases
);

const retrospectiveListQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).default(50),
  offset: z.coerce.number().int().nonnegative().default(0),
  status: retrospectiveStatusSchema.optional()
});

const createRetrospectiveSchema = z.object({
  templateId: z.string().trim().min(1).optional(),
  title: z.string().trim().min(1).optional()
});

const retrospectiveTemplateRoundSchema = z.object({
  configJson: z.string().optional(),
  entryPhase: retrospectiveNoteEntryPhaseSchema.nullable().optional(),
  kind: retrospectiveTemplateRoundKindSchema,
  privacy: retrospectivePrivacySchema.nullable().optional(),
  prompt: z.string().optional(),
  title: z.string().trim().min(1)
});

const retrospectiveTemplateSchema = z.object({
  description: z.string().optional(),
  name: z.string().trim().min(1),
  rounds: z.array(retrospectiveTemplateRoundSchema).min(1)
});

const retrospectiveNoteListQuerySchema = z.object({
  commitmentPeriodId: z.string().trim().min(1).optional(),
  retrospectiveId: z.string().trim().min(1).optional(),
  roundId: z.string().trim().min(1).optional(),
  templateRoundId: z.string().trim().min(1).optional()
});

const createRetrospectiveNoteSchema = z.object({
  body: z.string().trim().min(1),
  commitmentPeriodId: z.string().trim().min(1),
  entryPhase: retrospectiveNoteWriteEntryPhaseSchema,
  retrospectiveId: z.string().trim().min(1).nullable().optional(),
  roundId: z.string().trim().min(1).nullable().optional(),
  templateRoundId: z.string().trim().min(1).nullable().optional()
});

const updateRetrospectiveNoteSchema = z.object({
  body: z.string().trim().min(1)
});

const commitmentListQuerySchema = z.object({
  assigneeUserId: z.string().trim().min(1).optional(),
  commitmentPeriodId: z.string().trim().min(1).optional(),
  status: commitmentStatusSchema.optional()
});

const commitmentSchema = z.object({
  assigneeUserId: z.string().trim().min(1).nullable().optional(),
  checklistItems: z
    .array(
      z.object({
        body: z.string().trim().min(1),
        isCompleted: z.boolean().optional()
      })
    )
    .optional(),
  commitmentPeriodId: z.string().trim().min(1).nullable().optional(),
  createdInRetrospectiveId: z.string().trim().min(1).nullable().optional(),
  description: z.string().optional(),
  status: commitmentStatusSchema.optional(),
  targetCount: z.number().int().nonnegative().nullable().optional(),
  title: z.string().trim().min(1),
  trackingInterval: commitmentTrackingIntervalSchema.optional(),
  trackingKind: commitmentTrackingKindSchema
});

const commitmentCheckinSchema = z.object({
  amount: z.number().int().positive().optional(),
  checkinOn: isoDateSchema,
  note: z.string().optional()
});

const commitmentReviewSchema = z.object({
  note: z.string().optional(),
  rating: commitmentReviewRatingSchema,
  retrospectiveId: z.string().trim().min(1),
  roundId: z.string().trim().min(1)
});

const updateCommitmentReviewSchema = z.object({
  note: z.string().optional(),
  rating: commitmentReviewRatingSchema
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

function hasHeader(
  headers: Record<string, string | undefined>,
  name: string
) {
  return Object.keys(headers).some((headerName) => headerName.toLowerCase() === name.toLowerCase());
}

function getAuthFailureError(
  c: Context<{ Variables: AppVariables }>,
  headers: Record<string, string | undefined>
) {
  const mode = c.var.config.authMode;

  if (headers.authorization) {
    return new ApiError(401, "unauthorized", "Invalid or expired service token.");
  }

  if (mode === "trusted_header" && hasHeader(headers, c.var.config.trustedEmailHeader)) {
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

function getHeaderValue(
  headers: Record<string, string | undefined>,
  name: string
) {
  const entry = Object.entries(headers).find(
    ([headerName]) => headerName.toLowerCase() === name.toLowerCase()
  );

  return entry?.[1];
}

function getBootstrapAuthenticatedEmail(
  c: Context<{ Variables: AppVariables }>,
  headers: Record<string, string | undefined>
) {
  if (c.var.config.authMode === "trusted_header") {
    return getHeaderValue(headers, c.var.config.trustedEmailHeader)?.trim().toLowerCase() ?? null;
  }

  if (c.var.config.authMode === "local_dev") {
    return headers["x-swntd-dev-email"]?.trim().toLowerCase() ?? null;
  }

  return null;
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

  app.get("/healthz", (c) =>
    c.json({
      status: "ok"
    })
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

  app.get("/api/v1/bootstrap/context", async (c) => {
    const headers = headersToObject(c);

    return jsonOk(
      c,
      await getBootstrapContext(
        c.var.db,
        c.var.config,
        getBootstrapAuthenticatedEmail(c, headers)
      )
    );
  });

  app.post("/api/v1/bootstrap/claim", async (c) => {
    const headers = headersToObject(c);

    return jsonOk(
      c,
      await claimBootstrapOwnership(
        c.var.db,
        c.var.config,
        getBootstrapAuthenticatedEmail(c, headers)
      ),
      201
    );
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

  app.patch("/api/v1/labels/:labelId", async (c) => {
    const input = await parseJsonBody(c, updateLabelSchema);

    return jsonOk(
      c,
      await updateLabel(c.var.db, c.var.actor, c.req.param("labelId"), input)
    );
  });

  app.delete("/api/v1/labels/:labelId", async (c) =>
    jsonOk(c, await deleteLabel(c.var.db, c.var.actor, c.req.param("labelId")))
  );

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

  app.get("/api/v1/retrospective-home", async (c) =>
    jsonOk(c, await getRetrospectiveHome(c.var.db, c.var.actor))
  );

  app.get("/api/v1/retrospective-templates", async (c) =>
    jsonOk(c, await listRetrospectiveTemplates(c.var.db, c.var.actor))
  );

  app.post("/api/v1/retrospective-templates", async (c) => {
    const input = await parseJsonBody(c, retrospectiveTemplateSchema);

    return jsonOk(
      c,
      await createRetrospectiveTemplate(c.var.db, c.var.actor, input),
      201
    );
  });

  app.patch("/api/v1/retrospective-templates/:templateId", async (c) => {
    const input = await parseJsonBody(c, retrospectiveTemplateSchema);

    return jsonOk(
      c,
      await updateRetrospectiveTemplate(
        c.var.db,
        c.var.actor,
        c.req.param("templateId"),
        input
      )
    );
  });

  app.get("/api/v1/retrospectives", async (c) => {
    const query = parseQuery(c, retrospectiveListQuerySchema);

    return jsonOk(c, await listRetrospectives(c.var.db, c.var.actor, query));
  });

  app.post("/api/v1/retrospectives", async (c) => {
    const input = await parseJsonBody(c, createRetrospectiveSchema);

    return jsonOk(
      c,
      await createRetrospective(c.var.db, c.var.actor, input),
      201
    );
  });

  app.get("/api/v1/retrospectives/:retrospectiveId", async (c) =>
    jsonOk(
      c,
      await getRetrospectiveDetail(
        c.var.db,
        c.var.actor,
        c.req.param("retrospectiveId")
      )
    )
  );

  app.post("/api/v1/retrospectives/:retrospectiveId/start", async (c) =>
    jsonOk(
      c,
      await startRetrospective(
        c.var.db,
        c.var.actor,
        c.req.param("retrospectiveId")
      )
    )
  );

  app.post("/api/v1/retrospectives/:retrospectiveId/rounds/:roundId/enter", async (c) =>
    jsonOk(
      c,
      await enterRetrospectiveRound(
        c.var.db,
        c.var.actor,
        c.req.param("retrospectiveId"),
        c.req.param("roundId")
      )
    )
  );

  app.post("/api/v1/retrospectives/:retrospectiveId/rounds/:roundId/complete", async (c) =>
    jsonOk(
      c,
      await completeRetrospectiveRound(
        c.var.db,
        c.var.actor,
        c.req.param("retrospectiveId"),
        c.req.param("roundId")
      )
    )
  );

  app.post("/api/v1/retrospectives/:retrospectiveId/finalize", async (c) =>
    jsonOk(
      c,
      await finalizeRetrospective(
        c.var.db,
        c.var.actor,
        c.req.param("retrospectiveId")
      )
    )
  );

  app.get("/api/v1/retrospective-notes", async (c) => {
    const query = parseQuery(c, retrospectiveNoteListQuerySchema);

    return jsonOk(c, await listRetrospectiveNotes(c.var.db, c.var.actor, query));
  });

  app.post("/api/v1/retrospective-notes", async (c) => {
    const input = await parseJsonBody(c, createRetrospectiveNoteSchema);

    return jsonOk(
      c,
      await createRetrospectiveNote(c.var.db, c.var.actor, input),
      201
    );
  });

  app.patch("/api/v1/retrospective-notes/:noteId", async (c) => {
    const input = await parseJsonBody(c, updateRetrospectiveNoteSchema);

    return jsonOk(
      c,
      await updateRetrospectiveNote(
        c.var.db,
        c.var.actor,
        c.req.param("noteId"),
        input
      )
    );
  });

  app.delete("/api/v1/retrospective-notes/:noteId", async (c) =>
    jsonOk(
      c,
      await deleteRetrospectiveNote(
        c.var.db,
        c.var.actor,
        c.req.param("noteId")
      )
    )
  );

  app.get("/api/v1/commitments", async (c) => {
    const query = parseQuery(c, commitmentListQuerySchema);

    return jsonOk(c, await listCommitments(c.var.db, c.var.actor, query));
  });

  app.post("/api/v1/commitments", async (c) => {
    const input = await parseJsonBody(c, commitmentSchema);

    return jsonOk(c, await createCommitment(c.var.db, c.var.actor, input), 201);
  });

  app.patch("/api/v1/commitments/:commitmentId", async (c) => {
    const input = await parseJsonBody(c, commitmentSchema);

    return jsonOk(
      c,
      await updateCommitment(
        c.var.db,
        c.var.actor,
        c.req.param("commitmentId"),
        input
      )
    );
  });

  app.post("/api/v1/commitments/:commitmentId/checkins", async (c) => {
    const input = await parseJsonBody(c, commitmentCheckinSchema);

    return jsonOk(
      c,
      await createCommitmentCheckin(
        c.var.db,
        c.var.actor,
        c.req.param("commitmentId"),
        input
      ),
      201
    );
  });

  app.delete("/api/v1/commitment-checkins/:checkinId", async (c) =>
    jsonOk(
      c,
      await deleteCommitmentCheckin(
        c.var.db,
        c.var.actor,
        c.req.param("checkinId")
      )
    )
  );

  app.post("/api/v1/commitments/:commitmentId/reviews", async (c) => {
    const input = await parseJsonBody(c, commitmentReviewSchema);

    return jsonOk(
      c,
      await createCommitmentReview(
        c.var.db,
        c.var.actor,
        c.req.param("commitmentId"),
        input
      ),
      201
    );
  });

  app.patch("/api/v1/commitment-reviews/:reviewId", async (c) => {
    const input = await parseJsonBody(c, updateCommitmentReviewSchema);

    return jsonOk(
      c,
      await updateCommitmentReview(
        c.var.db,
        c.var.actor,
        c.req.param("reviewId"),
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

  app.post("/api/v1/tasks/:taskId/checklist-items", async (c) => {
    const input = await parseJsonBody(c, addChecklistItemSchema);

    return jsonOk(
      c,
      await addChecklistItemToTask(c.var.db, c.var.actor, c.req.param("taskId"), input),
      201
    );
  });

  app.post("/api/v1/tasks/:taskId/checklist-items/:checklistItemId/completion", async (c) => {
    const input = await parseJsonBody(c, setChecklistItemCompletionSchema);

    return jsonOk(
      c,
      await setChecklistItemCompletion(
        c.var.db,
        c.var.actor,
        c.req.param("taskId"),
        c.req.param("checklistItemId"),
        input
      )
    );
  });

  app.delete("/api/v1/tasks/:taskId/checklist-items/:checklistItemId", async (c) => {
    const input = await parseJsonBody(c, deleteChecklistItemSchema);

    return jsonOk(
      c,
      await deleteChecklistItemFromTask(
        c.var.db,
        c.var.actor,
        c.req.param("taskId"),
        c.req.param("checklistItemId"),
        input
      )
    );
  });

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

  app.delete("/api/v1/tasks/:taskId", async (c) => {
    const input = await parseJsonBody(c, archiveSchema);
    const result = await deleteArchivedTask(
      c.var.db,
      c.var.actor,
      c.req.param("taskId"),
      input.expectedRevision
    );

    await Promise.allSettled(
      result.uploadStoragePaths.map((storagePath) =>
        deleteStoredUpload(storagePath, c.var.config)
      )
    );

    return jsonOk(c, {
      item: {
        id: result.deletedTaskId
      }
    });
  });

  app.get("/api/v1/openapi.json", (c) =>
    jsonOk(c, {
      openapi: "3.1.0",
      paths: {
        "/api/v1/bootstrap/claim": ["post"],
        "/api/v1/bootstrap/context": ["get"],
        "/api/v1/commitments": ["get", "post"],
        "/api/v1/commitments/{commitmentId}": ["patch"],
        "/api/v1/commitments/{commitmentId}/checkins": ["post"],
        "/api/v1/commitments/{commitmentId}/reviews": ["post"],
        "/api/v1/commitment-checkins/{checkinId}": ["delete"],
        "/api/v1/commitment-reviews/{reviewId}": ["patch"],
        "/api/v1/labels": ["get", "post"],
        "/api/v1/labels/:labelId": ["patch", "delete"],
        "/api/v1/me": ["get"],
        "/api/v1/recurring-templates": ["get", "post"],
        "/api/v1/recurring-templates/{templateId}": ["get", "patch"],
        "/api/v1/retrospective-home": ["get"],
        "/api/v1/retrospective-notes": ["get", "post"],
        "/api/v1/retrospective-notes/{noteId}": ["patch", "delete"],
        "/api/v1/retrospective-templates": ["get", "post"],
        "/api/v1/retrospective-templates/{templateId}": ["patch"],
        "/api/v1/retrospectives": ["get", "post"],
        "/api/v1/retrospectives/{retrospectiveId}": ["get"],
        "/api/v1/retrospectives/{retrospectiveId}/finalize": ["post"],
        "/api/v1/retrospectives/{retrospectiveId}/rounds/{roundId}/complete": ["post"],
        "/api/v1/retrospectives/{retrospectiveId}/rounds/{roundId}/enter": ["post"],
        "/api/v1/retrospectives/{retrospectiveId}/start": ["post"],
        "/api/v1/settings": ["get", "patch"],
        "/api/v1/tasks": ["get", "post"],
        "/api/v1/tasks/{taskId}": ["get", "patch", "delete"],
        "/api/v1/tasks/{taskId}/archive": ["post"],
        "/api/v1/tasks/{taskId}/attachment-links": ["post"],
        "/api/v1/tasks/{taskId}/checklist-items": ["post"],
        "/api/v1/tasks/{taskId}/checklist-items/{checklistItemId}": ["delete"],
        "/api/v1/tasks/{taskId}/checklist-items/{checklistItemId}/completion": ["post"],
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
