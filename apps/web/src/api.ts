export const taskStatuses = [
  "To Do",
  "In Progress",
  "Waiting",
  "Done"
] as const;

export type TaskStatus = (typeof taskStatuses)[number];

export type Actor = {
  authStrategy: "local_dev" | "trusted_header" | "service_token";
  displayName: string;
  email: string | null;
  householdId: string;
  id: string;
  role: "admin" | "service";
  serviceKind: string | null;
};

export type UserRef = {
  deactivatedAt: string | null;
  displayName: string;
  email: string | null;
  id: string;
  role: "admin" | "service";
  serviceKind: string | null;
};

export type ServiceToken = {
  createdAt: string;
  expiresAt: string | null;
  id: string;
  lastUsedAt: string | null;
  name: string;
  revokedAt: string | null;
  userId: string;
};

export type Label = {
  color: string | null;
  createdAt: string;
  id: string;
  name: string;
  updatedAt: string;
};

export type ChecklistItem = {
  body: string;
  createdAt: string;
  id: string;
  isCompleted: boolean;
  sortOrder: number;
  updatedAt: string;
};

export type Attachment = {
  byteSize: number | null;
  createdAt: string;
  downloadUrl: string | null;
  externalUrl: string | null;
  id: string;
  mimeType: string | null;
  originalName: string;
  storageKind: "upload" | "external_link";
  uploadedBy: UserRef;
};

export type Comment = {
  author: UserRef;
  body: string;
  createdAt: string;
  id: string;
  updatedAt: string;
};

export type TaskListItem = {
  aiAssistanceEnabled: boolean;
  archivedAt: string | null;
  assignee: UserRef | null;
  attachmentCount: number;
  checklistItems: ChecklistItem[];
  checklistProgress: {
    completed: number;
    total: number;
  };
  commentCount: number;
  completedAt: string | null;
  createdAt: string;
  createdByUserId: string;
  description: string;
  dueOn: string | null;
  dueTime: string | null;
  householdId: string;
  id: string;
  labels: Label[];
  recurringTaskTemplateId: string | null;
  revision: number;
  sortKey: number;
  status: TaskStatus;
  title: string;
  updatedAt: string;
  updatedByUserId: string;
};

export type TaskDetail = TaskListItem & {
  attachments: Attachment[];
  comments: Comment[];
};

export type Settings = {
  createdAt: string;
  defaultCalendarExportKind: "google" | "ics";
  defaultTimezone: string;
  doneArchiveAfterDays: number;
  finalizedRetrospectiveEditPolicy: "locked" | "editable";
  nearDueThresholdDays: number;
  defaultRetrospectiveTemplateId: string | null;
  householdId: string;
  retrospectiveCadence: "weekly" | "monthly" | "quarterly" | "custom";
  retrospectiveCadenceInterval: number;
  updatedAt: string;
};

export type RecurringTemplate = {
  aiAssistanceEnabledDefault: boolean;
  checklistItems: Array<{
    body: string;
    createdAt: string;
    id: string;
    sortOrder: number;
    updatedAt: string;
  }>;
  createdAt: string;
  defaultAssignee: UserRef | null;
  defaultDueTime: string | null;
  description: string;
  id: string;
  isActive: boolean;
  labels: Label[];
  nextOccurrenceOn: string;
  recurrenceCadence: "daily" | "weekly" | "monthly";
  recurrenceInterval: number;
  title: string;
  updatedAt: string;
};

export type RetrospectiveRoundKind =
  | "commitment_review"
  | "task_lookback"
  | "notes"
  | "commitment_capture";
export type RetrospectiveEntryPhase =
  | "commitment_period"
  | "retrospective"
  | "both";
export type RetrospectiveNoteWritePhase = "commitment_period" | "retrospective";
export type RetrospectivePrivacy = "shared" | "private_until_round" | "private";
export type RetrospectiveNoteVisibility =
  | "shared"
  | "private_until_round"
  | "private"
  | "revealed";
export type CommitmentTrackingKind =
  | "binary"
  | "count_per_period"
  | "checklist"
  | "freeform";
export type CommitmentTrackingInterval = "none" | "daily" | "weekly" | "monthly";
export type CommitmentStatus = "active" | "reviewed" | "archived";
export type CommitmentReviewRating =
  | "met"
  | "mostly_met"
  | "partly_met"
  | "missed"
  | "skipped";

export type RetrospectiveTemplateRound = {
  configJson: string;
  createdAt: string;
  entryPhase: RetrospectiveEntryPhase | null;
  id: string;
  kind: RetrospectiveRoundKind;
  privacy: RetrospectivePrivacy | null;
  prompt: string;
  sortOrder: number;
  title: string;
  updatedAt: string;
};

export type RetrospectiveTemplate = {
  createdAt: string;
  description: string;
  id: string;
  isSystem: boolean;
  name: string;
  rounds: RetrospectiveTemplateRound[];
  updatedAt: string;
};

export type RetrospectiveTemplateRoundInput = {
  configJson?: string;
  entryPhase?: RetrospectiveEntryPhase | null;
  kind: RetrospectiveRoundKind;
  privacy?: RetrospectivePrivacy | null;
  prompt?: string;
  title: string;
};

export type RetrospectiveTemplateInput = {
  description?: string;
  name: string;
  rounds: RetrospectiveTemplateRoundInput[];
};

export type CommitmentPeriod = {
  closureOn: string;
  createdAt: string;
  householdId: string;
  id: string;
  openedByRetrospectiveId: string | null;
  periodStartOn: string;
  reviewedByRetrospectiveId: string | null;
  status: "active" | "closed" | "reviewed";
  updatedAt: string;
};

export type RetrospectiveRound = {
  completedAt: string | null;
  configJson: string;
  createdAt: string;
  entryPhase: RetrospectiveEntryPhase | null;
  id: string;
  kind: RetrospectiveRoundKind;
  privacy: RetrospectivePrivacy | null;
  prompt: string;
  retrospectiveId: string;
  sortOrder: number;
  sourceTemplateRoundId: string | null;
  startedAt: string | null;
  summary: string;
  title: string;
  updatedAt: string;
};

export type Retrospective = {
  commitmentPeriodId: string;
  createdAt: string;
  createdByUserId: string;
  currentRoundId: string | null;
  finalizedAt: string | null;
  householdId: string;
  id: string;
  rounds: RetrospectiveRound[];
  startedAt: string | null;
  status: "draft" | "active" | "finalized";
  templateId: string;
  title: string;
  updatedAt: string;
  updatedByUserId: string;
};

export type RetrospectiveNote = {
  author: UserRef | null;
  authorUserId: string;
  body: string;
  commitmentPeriodId: string;
  createdAt: string;
  entryPhase: RetrospectiveNoteWritePhase;
  householdId: string;
  id: string;
  retrospectiveId: string | null;
  revealedAt: string | null;
  revealedInRetrospectiveId: string | null;
  revealedInRoundId: string | null;
  roundId: string | null;
  sortOrder: number;
  templateRoundId: string | null;
  updatedAt: string;
  visibilityState: RetrospectiveNoteVisibility;
};

export type Commitment = {
  assignee: UserRef | null;
  assigneeUserId: string | null;
  checkins: Array<{
    actor: UserRef | null;
    amount: number;
    checkinOn: string;
    createdAt: string;
    id: string;
    note: string;
    updatedAt: string;
  }>;
  checklistItems: Array<{
    body: string;
    createdAt: string;
    id: string;
    isCompleted: boolean;
    sortOrder: number;
    updatedAt: string;
  }>;
  commitmentPeriodId: string | null;
  completedAt: string | null;
  createdAt: string;
  createdByUserId: string;
  createdInRetrospectiveId: string | null;
  description: string;
  householdId: string;
  id: string;
  status: CommitmentStatus;
  targetCount: number | null;
  title: string;
  trackingInterval: CommitmentTrackingInterval;
  trackingKind: CommitmentTrackingKind;
  updatedAt: string;
  updatedByUserId: string;
};

export type RetrospectiveHome = {
  activePeriod: CommitmentPeriod | null;
  commitments: Commitment[];
  daysUntilClosure: number | null;
  notes: RetrospectiveNote[];
  openRetrospective: Retrospective | null;
  recentRetrospectives: Retrospective[];
  settings: Settings | null;
};

export type RetrospectiveDetail = Retrospective & {
  commitments: Commitment[];
  notes: RetrospectiveNote[];
  period: CommitmentPeriod | null;
  taskLookback: TaskListItem[];
};

export type CommitmentReview = {
  commitmentId: string;
  createdAt: string;
  createdBy: UserRef | null;
  createdByUserId: string;
  id: string;
  note: string;
  rating: CommitmentReviewRating;
  retrospectiveId: string;
  roundId: string;
  updatedAt: string;
  updatedByUserId: string;
};

export type BootstrapContext = {
  authenticatedEmail: string | null;
  canClaimOwnership: boolean;
  claimStatus:
    | "already_member"
    | "email_not_allowed"
    | "not_authenticated"
    | "ready"
    | "setup_locked";
  householdName: string;
};

export type ApiErrorShape = {
  code: string;
  details: unknown;
  message: string;
};

export class SwntdApiError extends Error {
  code: string;
  details: unknown;
  status: number;

  constructor(status: number, error: ApiErrorShape) {
    super(error.message);
    this.name = "SwntdApiError";
    this.code = error.code;
    this.details = error.details;
    this.status = status;
  }
}

const devActorEmail = import.meta.env.VITE_SWNTD_DEV_ACTOR_EMAIL?.trim();

function createHeaders(initHeaders?: HeadersInit) {
  const headers = new Headers(initHeaders);

  if (devActorEmail) {
    headers.set("x-swntd-dev-email", devActorEmail);
  }

  return headers;
}

async function request<T>(path: string, init: RequestInit = {}) {
  const response = await fetch(path, {
    ...init,
    headers: createHeaders(init.headers)
  });

  if (!response.ok) {
    const fallbackError: ApiErrorShape = {
      code: "request_failed",
      details: null,
      message: "Request failed."
    };

    let errorShape = fallbackError;

    try {
      const payload = (await response.json()) as {
        error?: ApiErrorShape;
      };

      if (payload.error) {
        errorShape = payload.error;
      }
    } catch {
      // Ignore JSON parsing failures for non-JSON errors.
    }

    throw new SwntdApiError(response.status, errorShape);
  }

  return (await response.json()) as T;
}

export function isConflictError(error: unknown) {
  return error instanceof SwntdApiError && error.status === 409;
}

export async function downloadAttachment(url: string, filename: string) {
  const response = await fetch(url, {
    headers: createHeaders()
  });

  if (!response.ok) {
    throw new SwntdApiError(response.status, {
      code: "download_failed",
      details: null,
      message: "Attachment download failed."
    });
  }

  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = objectUrl;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(objectUrl);
}

export async function loadAttachmentObjectUrl(url: string) {
  const response = await fetch(url, {
    headers: createHeaders()
  });

  if (!response.ok) {
    throw new SwntdApiError(response.status, {
      code: "attachment_preview_failed",
      details: null,
      message: "Attachment preview failed."
    });
  }

  const blob = await response.blob();

  return URL.createObjectURL(blob);
}

export const api = {
  addAttachmentLink(taskId: string, input: { name: string; url: string }) {
    return request<{ item: TaskDetail }>(`/api/v1/tasks/${taskId}/attachment-links`, {
      body: JSON.stringify(input),
      headers: {
        "content-type": "application/json"
      },
      method: "POST"
    });
  },
  addComment(taskId: string, input: { body: string }) {
    return request<{ item: TaskDetail }>(`/api/v1/tasks/${taskId}/comments`, {
      body: JSON.stringify(input),
      headers: {
        "content-type": "application/json"
      },
      method: "POST"
    });
  },
  archiveTask(taskId: string, expectedRevision: number) {
    return request<{ item: TaskDetail }>(`/api/v1/tasks/${taskId}/archive`, {
      body: JSON.stringify({ expectedRevision }),
      headers: {
        "content-type": "application/json"
      },
      method: "POST"
    });
  },
  createLabel(input: { color?: string | null; name: string }) {
    return request<{ item: Label }>("/api/v1/labels", {
      body: JSON.stringify(input),
      headers: {
        "content-type": "application/json"
      },
      method: "POST"
    });
  },
  deleteLabel(labelId: string) {
    return request<{ item: Label }>(`/api/v1/labels/${labelId}`, {
      method: "DELETE"
    });
  },
  deleteTask(taskId: string, expectedRevision: number) {
    return request<{ item: { id: string } }>(`/api/v1/tasks/${taskId}`, {
      body: JSON.stringify({ expectedRevision }),
      headers: {
        "content-type": "application/json"
      },
      method: "DELETE"
    });
  },
  claimBootstrapOwnership() {
    return request<{ actor: Actor }>("/api/v1/bootstrap/claim", {
      method: "POST"
    });
  },
  createRecurringTemplate(input: {
    aiAssistanceEnabledDefault: boolean;
    checklistItems: Array<{ body: string }>;
    defaultAssigneeUserId: string | null;
    defaultDueTime: string | null;
    description: string;
    isActive: boolean;
    labelIds: string[];
    nextOccurrenceOn: string;
    recurrenceCadence: "daily" | "weekly" | "monthly";
    recurrenceInterval: number;
    title: string;
  }) {
    return request<{ item: RecurringTemplate }>("/api/v1/recurring-templates", {
      body: JSON.stringify(input),
      headers: {
        "content-type": "application/json"
      },
      method: "POST"
    });
  },
  createCommitment(input: {
    assigneeUserId?: string | null;
    checklistItems?: Array<{ body: string; isCompleted?: boolean }>;
    commitmentPeriodId?: string | null;
    createdInRetrospectiveId?: string | null;
    description?: string;
    targetCount?: number | null;
    title: string;
    trackingInterval?: CommitmentTrackingInterval;
    trackingKind: CommitmentTrackingKind;
  }) {
    return request<{ item: Commitment }>("/api/v1/commitments", {
      body: JSON.stringify(input),
      headers: {
        "content-type": "application/json"
      },
      method: "POST"
    });
  },
  createCommitmentCheckin(
    commitmentId: string,
    input: { amount?: number; checkinOn: string; note?: string }
  ) {
    return request<{ item: { amount: number; checkinOn: string; id: string } }>(
      `/api/v1/commitments/${commitmentId}/checkins`,
      {
        body: JSON.stringify(input),
        headers: {
          "content-type": "application/json"
        },
        method: "POST"
      }
    );
  },
  deleteCommitmentCheckin(checkinId: string) {
    return request<{ item: { id: string } }>(
      `/api/v1/commitment-checkins/${checkinId}`,
      {
        method: "DELETE"
      }
    );
  },
  createCommitmentReview(
    commitmentId: string,
    input: {
      note?: string;
      rating: CommitmentReviewRating;
      retrospectiveId: string;
      roundId: string;
    }
  ) {
    return request<{ item: CommitmentReview }>(
      `/api/v1/commitments/${commitmentId}/reviews`,
      {
        body: JSON.stringify(input),
        headers: {
          "content-type": "application/json"
        },
        method: "POST"
      }
    );
  },
  createRetrospective(input: {
    closureOn?: string;
    templateId?: string;
    title?: string;
  }) {
    return request<{ item: RetrospectiveDetail }>("/api/v1/retrospectives", {
      body: JSON.stringify(input),
      headers: {
        "content-type": "application/json"
      },
      method: "POST"
    });
  },
  updateRetrospective(retrospectiveId: string, input: { closureOn?: string }) {
    return request<{ item: RetrospectiveDetail }>(
      `/api/v1/retrospectives/${retrospectiveId}`,
      {
        body: JSON.stringify(input),
        headers: {
          "content-type": "application/json"
        },
        method: "PATCH"
      }
    );
  },
  createRetrospectiveTemplate(input: RetrospectiveTemplateInput) {
    return request<{ item: RetrospectiveTemplate }>("/api/v1/retrospective-templates", {
      body: JSON.stringify(input),
      headers: {
        "content-type": "application/json"
      },
      method: "POST"
    });
  },
  createRetrospectiveNote(input: {
    body: string;
    commitmentPeriodId: string;
    entryPhase: RetrospectiveNoteWritePhase;
    retrospectiveId?: string | null;
    roundId?: string | null;
    templateRoundId?: string | null;
  }) {
    return request<{ item: RetrospectiveNote }>("/api/v1/retrospective-notes", {
      body: JSON.stringify(input),
      headers: {
        "content-type": "application/json"
      },
      method: "POST"
    });
  },
  deleteRetrospectiveNote(noteId: string) {
    return request<{ item: { id: string } }>(
      `/api/v1/retrospective-notes/${noteId}`,
      {
        method: "DELETE"
      }
    );
  },
  createTask(input: {
    aiAssistanceEnabled: boolean;
    assigneeUserId: string | null;
    checklistItems: Array<{ body: string; isCompleted: boolean }>;
    description: string;
    dueOn: string | null;
    dueTime: string | null;
    labelIds: string[];
    title: string;
  }) {
    return request<{ item: TaskDetail }>("/api/v1/tasks", {
      body: JSON.stringify(input),
      headers: {
        "content-type": "application/json"
      },
      method: "POST"
    });
  },
  createUser(
    input:
      | {
          displayName: string;
          email: string;
          role: "admin";
        }
      | {
          displayName: string;
          role: "service";
          serviceKind: string;
        }
  ) {
    return request<{ item: UserRef }>("/api/v1/users", {
      body: JSON.stringify(input),
      headers: {
        "content-type": "application/json"
      },
      method: "POST"
    });
  },
  getBootstrapContext() {
    return request<BootstrapContext>("/api/v1/bootstrap/context");
  },
  getMe() {
    return request<{ actor: Actor }>("/api/v1/me");
  },
  getOpenApi() {
    return request<{ paths: Record<string, string[]> }>("/api/v1/openapi.json");
  },
  getSettings() {
    return request<{ settings: Settings }>("/api/v1/settings");
  },
  getRetrospective(retrospectiveId: string) {
    return request<{ item: RetrospectiveDetail }>(
      `/api/v1/retrospectives/${retrospectiveId}`
    );
  },
  getRetrospectiveHome() {
    return request<RetrospectiveHome>("/api/v1/retrospective-home");
  },
  getTask(taskId: string) {
    return request<{ item: TaskDetail }>(`/api/v1/tasks/${taskId}`);
  },
  listLabels() {
    return request<{ items: Label[] }>("/api/v1/labels");
  },
  listRecurringTemplates() {
    return request<{ items: RecurringTemplate[] }>("/api/v1/recurring-templates");
  },
  listRetrospectiveTemplates() {
    return request<{ items: RetrospectiveTemplate[] }>(
      "/api/v1/retrospective-templates"
    );
  },
  listRetrospectives(params: {
    limit?: number;
    offset?: number;
    status?: Retrospective["status"];
  } = {}) {
    const url = new URL("/api/v1/retrospectives", window.location.origin);

    if (params.limit) {
      url.searchParams.set("limit", String(params.limit));
    }

    if (params.offset) {
      url.searchParams.set("offset", String(params.offset));
    }

    if (params.status) {
      url.searchParams.set("status", params.status);
    }

    return request<{ items: Retrospective[] }>(`${url.pathname}${url.search}`);
  },
  listTasks(params: {
    archived?: "exclude" | "include" | "only";
    assigneeUserId?: string;
    query?: string;
    status?: TaskStatus;
  }) {
    const url = new URL("/api/v1/tasks", window.location.origin);

    if (params.archived) {
      url.searchParams.set("archived", params.archived);
    }

    if (params.assigneeUserId) {
      url.searchParams.set("assigneeUserId", params.assigneeUserId);
    }

    if (params.query) {
      url.searchParams.set("query", params.query);
    }

    if (params.status) {
      url.searchParams.set("status", params.status);
    }

    return request<{ items: TaskListItem[]; total: number }>(
      `${url.pathname}${url.search}`
    );
  },
  listUsers() {
    return request<{ items: UserRef[] }>("/api/v1/users");
  },
  listServiceTokens(userId: string) {
    return request<{ items: ServiceToken[] }>(`/api/v1/users/${userId}/service-tokens`);
  },
  issueServiceToken(userId: string, input: { name: string }) {
    return request<{ item: ServiceToken; plainTextToken: string }>(
      `/api/v1/users/${userId}/service-tokens`,
      {
        body: JSON.stringify(input),
        headers: {
          "content-type": "application/json"
        },
        method: "POST"
      }
    );
  },
  revokeServiceToken(tokenId: string) {
    return request<{ item: ServiceToken }>(`/api/v1/service-tokens/${tokenId}/revoke`, {
      method: "POST"
    });
  },
  removeUser(userId: string) {
    return request<{ item: UserRef }>(`/api/v1/users/${userId}/remove`, {
      method: "POST"
    });
  },
  reorderTask(taskId: string, input: { expectedRevision: number; targetIndex: number }) {
    return request<{ item: TaskDetail }>(`/api/v1/tasks/${taskId}/reorder`, {
      body: JSON.stringify(input),
      headers: {
        "content-type": "application/json"
      },
      method: "POST"
    });
  },
  transitionTask(taskId: string, input: { expectedRevision: number; status: TaskStatus }) {
    return request<{ item: TaskDetail }>(`/api/v1/tasks/${taskId}/status`, {
      body: JSON.stringify(input),
      headers: {
        "content-type": "application/json"
      },
      method: "POST"
    });
  },
  enterRetrospectiveRound(retrospectiveId: string, roundId: string) {
    return request<{ item: RetrospectiveDetail }>(
      `/api/v1/retrospectives/${retrospectiveId}/rounds/${roundId}/enter`,
      {
        method: "POST"
      }
    );
  },
  completeRetrospectiveRound(retrospectiveId: string, roundId: string) {
    return request<{ item: RetrospectiveDetail }>(
      `/api/v1/retrospectives/${retrospectiveId}/rounds/${roundId}/complete`,
      {
        method: "POST"
      }
    );
  },
  finalizeRetrospective(retrospectiveId: string) {
    return request<{ item: RetrospectiveDetail }>(
      `/api/v1/retrospectives/${retrospectiveId}/finalize`,
      {
        method: "POST"
      }
    );
  },
  startRetrospective(retrospectiveId: string) {
    return request<{ item: RetrospectiveDetail }>(
      `/api/v1/retrospectives/${retrospectiveId}/start`,
      {
        method: "POST"
      }
    );
  },
  unarchiveTask(taskId: string, expectedRevision: number) {
    return request<{ item: TaskDetail }>(`/api/v1/tasks/${taskId}/unarchive`, {
      body: JSON.stringify({ expectedRevision }),
      headers: {
        "content-type": "application/json"
      },
      method: "POST"
    });
  },
  updateLabel(labelId: string, input: { color?: string | null; name?: string }) {
    return request<{ item: Label }>(`/api/v1/labels/${labelId}`, {
      body: JSON.stringify(input),
      headers: {
        "content-type": "application/json"
      },
      method: "PATCH"
    });
  },
  updateRecurringTemplate(
    templateId: string,
    input: {
      aiAssistanceEnabledDefault: boolean;
      checklistItems: Array<{ body: string }>;
      defaultAssigneeUserId: string | null;
      defaultDueTime: string | null;
      description: string;
      isActive: boolean;
      labelIds: string[];
      nextOccurrenceOn: string;
      recurrenceCadence: "daily" | "weekly" | "monthly";
      recurrenceInterval: number;
      title: string;
    }
  ) {
    return request<{ item: RecurringTemplate }>(
      `/api/v1/recurring-templates/${templateId}`,
      {
        body: JSON.stringify(input),
        headers: {
          "content-type": "application/json"
        },
        method: "PATCH"
      }
    );
  },
  updateRetrospectiveTemplate(
    templateId: string,
    input: RetrospectiveTemplateInput
  ) {
    return request<{ item: RetrospectiveTemplate }>(
      `/api/v1/retrospective-templates/${templateId}`,
      {
        body: JSON.stringify(input),
        headers: {
          "content-type": "application/json"
        },
        method: "PATCH"
      }
    );
  },
  updateSettings(input: {
    defaultCalendarExportKind?: "google" | "ics";
    defaultTimezone?: string;
    doneArchiveAfterDays?: number;
    finalizedRetrospectiveEditPolicy?: "locked" | "editable";
    nearDueThresholdDays?: number;
    retrospectiveCadence?: "weekly" | "monthly" | "quarterly" | "custom";
    retrospectiveCadenceInterval?: number;
    defaultRetrospectiveTemplateId?: string | null;
  }) {
    return request<{ settings: Settings }>("/api/v1/settings", {
      body: JSON.stringify(input),
      headers: {
        "content-type": "application/json"
      },
      method: "PATCH"
    });
  },
  updateCommitment(
    commitmentId: string,
    input: {
      assigneeUserId?: string | null;
      checklistItems?: Array<{ body: string; isCompleted?: boolean }>;
      commitmentPeriodId?: string | null;
      createdInRetrospectiveId?: string | null;
      description?: string;
      status?: CommitmentStatus;
      targetCount?: number | null;
      title: string;
      trackingInterval?: CommitmentTrackingInterval;
      trackingKind: CommitmentTrackingKind;
    }
  ) {
    return request<{ item: Commitment }>(`/api/v1/commitments/${commitmentId}`, {
      body: JSON.stringify(input),
      headers: {
        "content-type": "application/json"
      },
      method: "PATCH"
    });
  },
  updateCommitmentReview(
    reviewId: string,
    input: { note?: string; rating: CommitmentReviewRating }
  ) {
    return request<{ item: CommitmentReview }>(
      `/api/v1/commitment-reviews/${reviewId}`,
      {
        body: JSON.stringify(input),
        headers: {
          "content-type": "application/json"
        },
        method: "PATCH"
      }
    );
  },
  updateRetrospectiveNote(noteId: string, input: { body: string }) {
    return request<{ item: RetrospectiveNote }>(
      `/api/v1/retrospective-notes/${noteId}`,
      {
        body: JSON.stringify(input),
        headers: {
          "content-type": "application/json"
        },
        method: "PATCH"
      }
    );
  },
  updateUser(
    userId: string,
    input: {
      displayName?: string;
      email?: string | null;
      serviceKind?: string;
    }
  ) {
    return request<{ item: UserRef }>(`/api/v1/users/${userId}`, {
      body: JSON.stringify(input),
      headers: {
        "content-type": "application/json"
      },
      method: "PATCH"
    });
  },
  updateTask(
    taskId: string,
    input: {
      aiAssistanceEnabled: boolean;
      assigneeUserId: string | null;
      checklistItems: Array<{ body: string; isCompleted: boolean }>;
      description: string;
      dueOn: string | null;
      dueTime: string | null;
      expectedRevision: number;
      labelIds: string[];
      title: string;
    }
  ) {
    return request<{ item: TaskDetail }>(`/api/v1/tasks/${taskId}`, {
      body: JSON.stringify(input),
      headers: {
        "content-type": "application/json"
      },
      method: "PATCH"
    });
  },
  uploadAttachment(taskId: string, file: File) {
    const formData = new FormData();
    formData.set("file", file);

    return request<{ item: TaskDetail }>(`/api/v1/tasks/${taskId}/uploads`, {
      body: formData,
      method: "POST"
    });
  }
};
