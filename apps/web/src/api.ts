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
  householdId: string;
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
  getMe() {
    return request<{ actor: Actor }>("/api/v1/me");
  },
  getOpenApi() {
    return request<{ paths: Record<string, string[]> }>("/api/v1/openapi.json");
  },
  getSettings() {
    return request<{ settings: Settings }>("/api/v1/settings");
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
  unarchiveTask(taskId: string, expectedRevision: number) {
    return request<{ item: TaskDetail }>(`/api/v1/tasks/${taskId}/unarchive`, {
      body: JSON.stringify({ expectedRevision }),
      headers: {
        "content-type": "application/json"
      },
      method: "POST"
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
  updateSettings(input: {
    defaultCalendarExportKind?: "google" | "ics";
    defaultTimezone?: string;
    doneArchiveAfterDays?: number;
  }) {
    return request<{ settings: Settings }>("/api/v1/settings", {
      body: JSON.stringify(input),
      headers: {
        "content-type": "application/json"
      },
      method: "PATCH"
    });
  },
  updateUser(
    userId: string,
    input: {
      deactivated?: boolean;
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
