import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  getAssistantActorId,
  issueAssistantBearerToken,
  setupApiTestEnvironment,
  teardownApiTestEnvironment,
  trustedHeader
} from "./test-support";

type TestApp = Awaited<ReturnType<typeof setupApiTestEnvironment>>["app"];
type JsonHeaders = Record<string, string>;

type LabelResponse = {
  item: {
    id: string;
  };
};

type MeResponse = {
  actor: {
    email: string | null;
    role: "admin" | "service";
  };
};

type UsersResponse = {
  items: Array<{
    deactivatedAt?: string | null;
    displayName?: string;
    email?: string | null;
    id: string;
    role: "admin" | "service";
    serviceKind: string | null;
  }>;
};

type UserResponse = {
  item: {
    deactivatedAt: string | null;
    displayName: string;
    email: string | null;
    id: string;
    role: "admin" | "service";
    serviceKind: string | null;
  };
};

type ServiceTokenResponse = {
  item: {
    id: string;
    name: string;
    revokedAt: string | null;
    userId: string;
  };
  plainTextToken?: string;
};

type ServiceTokenListResponse = {
  items: Array<{
    id: string;
    name: string;
    revokedAt: string | null;
    userId: string;
  }>;
};

type OpenApiResponse = {
  paths: Record<string, string[]>;
};

type SettingsResponse = {
  settings: {
    defaultCalendarExportKind: "google" | "ics";
    doneArchiveAfterDays: number;
  };
};

type TaskItemResponse = {
  item: {
    archivedAt: string | null;
    assignee?: {
      id: string;
    } | null;
    attachmentCount: number;
    attachments: Array<{
      downloadUrl: string | null;
      storageKind: string;
    }>;
    checklistProgress: {
      completed: number;
    };
    commentCount: number;
    comments: unknown[];
    id: string;
    labels: unknown[];
    revision: number;
    status: string;
  };
};

type TaskListResponse = {
  items: Array<{
    id: string;
  }>;
  total: number;
};

type TemplateResponse = {
  item: {
    aiAssistanceEnabledDefault: boolean;
    checklistItems: unknown[];
    id: string;
    labels: unknown[];
  };
};

type TemplateListResponse = {
  items: unknown[];
};

function jsonRequest(init: {
  body?: unknown;
  headers?: JsonHeaders;
  method: string;
}): RequestInit {
  const requestInit: RequestInit = {
    headers: {
      "content-type": "application/json",
      ...init.headers
    },
    method: init.method
  };

  if (init.body !== undefined) {
    requestInit.body = JSON.stringify(init.body);
  }

  return requestInit;
}

async function parseJson<T>(response: Response) {
  return (await response.json()) as T;
}

describe("Phase 3 API", () => {
  let app: TestApp;
  let uploadsDir: string;

  beforeEach(async () => {
    const environment = await setupApiTestEnvironment();

    app = environment.app;
    uploadsDir = environment.uploadsDir;
  });

  afterEach(async () => {
    await teardownApiTestEnvironment(uploadsDir);
  });

  it("supports the primary admin task workflow end to end", async () => {
    const adminHeaders = trustedHeader("admin1@example.com");

    const createLabelResponse = await app.request(
      "/api/v1/labels",
      jsonRequest({
        body: {
          color: "#c96",
          name: "Errand"
        },
        headers: adminHeaders,
        method: "POST"
      })
    );
    expect(createLabelResponse.status).toBe(201);
    const labelBody = await parseJson<LabelResponse>(createLabelResponse);
    const labelId = labelBody.item.id;

    const createTaskAResponse = await app.request(
      "/api/v1/tasks",
      jsonRequest({
        body: {
          checklistItems: [
            { body: "Buy ingredients" },
            { body: "Compare prices", isCompleted: true }
          ],
          description: "Pick up groceries on the way home.",
          dueOn: "2026-03-20",
          dueTime: "18:30",
          labelIds: [labelId],
          title: "Groceries"
        },
        headers: adminHeaders,
        method: "POST"
      })
    );
    expect(createTaskAResponse.status).toBe(201);
    const createdTaskA = await parseJson<TaskItemResponse>(createTaskAResponse);
    const taskAId = createdTaskA.item.id;

    const createTaskBResponse = await app.request(
      "/api/v1/tasks",
      jsonRequest({
        body: {
          title: "Dry cleaning"
        },
        headers: adminHeaders,
        method: "POST"
      })
    );
    expect(createTaskBResponse.status).toBe(201);
    const createdTaskB = await parseJson<TaskItemResponse>(createTaskBResponse);
    const taskBId = createdTaskB.item.id;

    const initialListResponse = await app.request(
      `/api/v1/tasks?status=${encodeURIComponent("To Do")}`,
      {
        headers: adminHeaders
      }
    );
    expect(initialListResponse.status).toBe(200);
    const initialList = await parseJson<TaskListResponse>(initialListResponse);
    expect(initialList.total).toBe(2);
    expect(initialList.items.map((item: { id: string }) => item.id)).toEqual([
      taskBId,
      taskAId
    ]);

    const reorderResponse = await app.request(
      `/api/v1/tasks/${taskAId}/reorder`,
      jsonRequest({
        body: {
          expectedRevision: createdTaskA.item.revision,
          targetIndex: 0
        },
        headers: adminHeaders,
        method: "POST"
      })
    );
    expect(reorderResponse.status).toBe(200);
    const reorderedTask = await parseJson<TaskItemResponse>(reorderResponse);
    expect(reorderedTask.item.revision).toBe(1);

    const staleReorderResponse = await app.request(
      `/api/v1/tasks/${taskAId}/reorder`,
      jsonRequest({
        body: {
          expectedRevision: 0,
          targetIndex: 1
        },
        headers: adminHeaders,
        method: "POST"
      })
    );
    expect(staleReorderResponse.status).toBe(409);

    const reorderedListResponse = await app.request(
      `/api/v1/tasks?status=${encodeURIComponent("To Do")}`,
      {
        headers: adminHeaders
      }
    );
    const reorderedList = await parseJson<TaskListResponse>(reorderedListResponse);
    expect(reorderedList.items.map((item: { id: string }) => item.id)).toEqual([
      taskAId,
      taskBId
    ]);

    const updateTaskResponse = await app.request(
      `/api/v1/tasks/${taskAId}`,
      jsonRequest({
        body: {
          aiAssistanceEnabled: true,
          checklistItems: [
            { body: "Buy ingredients", isCompleted: true },
            { body: "Compare prices", isCompleted: true }
          ],
          description: "Pick up groceries and toiletries.",
          dueOn: "2026-03-21",
          dueTime: "19:00",
          expectedRevision: reorderedTask.item.revision,
          labelIds: [labelId],
          title: "Groceries and toiletries"
        },
        headers: adminHeaders,
        method: "PATCH"
      })
    );
    expect(updateTaskResponse.status).toBe(200);
    const updatedTask = await parseJson<TaskItemResponse>(updateTaskResponse);
    expect(updatedTask.item.revision).toBe(2);
    expect(updatedTask.item.checklistProgress.completed).toBe(2);

    const statusResponse = await app.request(
      `/api/v1/tasks/${taskAId}/status`,
      jsonRequest({
        body: {
          expectedRevision: updatedTask.item.revision,
          status: "In Progress"
        },
        headers: adminHeaders,
        method: "POST"
      })
    );
    expect(statusResponse.status).toBe(200);
    const inProgressTask = await parseJson<TaskItemResponse>(statusResponse);
    expect(inProgressTask.item.status).toBe("In Progress");
    expect(inProgressTask.item.revision).toBe(3);

    const commentResponse = await app.request(
      `/api/v1/tasks/${taskAId}/comments`,
      jsonRequest({
        body: {
          body: "Rachel said we also need shampoo."
        },
        headers: adminHeaders,
        method: "POST"
      })
    );
    expect(commentResponse.status).toBe(201);
    const commentedTask = await parseJson<TaskItemResponse>(commentResponse);
    expect(commentedTask.item.commentCount).toBe(1);
    expect(commentedTask.item.comments).toHaveLength(1);

    const linkResponse = await app.request(
      `/api/v1/tasks/${taskAId}/attachment-links`,
      jsonRequest({
        body: {
          name: "Store flyer",
          url: "https://example.com/flyer"
        },
        headers: adminHeaders,
        method: "POST"
      })
    );
    expect(linkResponse.status).toBe(201);
    const linkedTask = await parseJson<TaskItemResponse>(linkResponse);
    expect(linkedTask.item.attachmentCount).toBe(1);

    const uploadForm = new FormData();
    uploadForm.set(
      "file",
      new File(["shopping notes"], "notes.txt", { type: "text/plain" })
    );

    const uploadResponse = await app.request(`/api/v1/tasks/${taskAId}/uploads`, {
      body: uploadForm,
      headers: adminHeaders,
      method: "POST"
    });
    expect(uploadResponse.status).toBe(201);
    const uploadedTask = await parseJson<TaskItemResponse>(uploadResponse);
    expect(uploadedTask.item.attachmentCount).toBe(2);
    const uploadedAttachment = uploadedTask.item.attachments.find(
      (attachment: { storageKind: string }) => attachment.storageKind === "upload"
    );
    expect(uploadedAttachment).toBeTruthy();
    expect(uploadedAttachment?.downloadUrl).toBeTruthy();

    const downloadResponse = await app.request(
      uploadedAttachment?.downloadUrl ?? "",
      {
        headers: adminHeaders
      }
    );
    expect(downloadResponse.status).toBe(200);
    expect(await downloadResponse.text()).toBe("shopping notes");

    const archiveResponse = await app.request(
      `/api/v1/tasks/${taskAId}/archive`,
      jsonRequest({
        body: {
          expectedRevision: inProgressTask.item.revision
        },
        headers: adminHeaders,
        method: "POST"
      })
    );
    expect(archiveResponse.status).toBe(200);
    const archivedTask = await parseJson<TaskItemResponse>(archiveResponse);
    expect(archivedTask.item.archivedAt).toBeTruthy();
    expect(archivedTask.item.revision).toBe(4);

    const unarchiveResponse = await app.request(
      `/api/v1/tasks/${taskAId}/unarchive`,
      jsonRequest({
        body: {
          expectedRevision: archivedTask.item.revision
        },
        headers: adminHeaders,
        method: "POST"
      })
    );
    expect(unarchiveResponse.status).toBe(200);
    const unarchivedTask = await parseJson<TaskItemResponse>(unarchiveResponse);
    expect(unarchivedTask.item.archivedAt).toBeNull();
    expect(unarchivedTask.item.revision).toBe(5);

    const detailResponse = await app.request(`/api/v1/tasks/${taskAId}`, {
      headers: adminHeaders
    });
    expect(detailResponse.status).toBe(200);
    const detail = await parseJson<TaskItemResponse>(detailResponse);
    expect(detail.item.labels).toHaveLength(1);
    expect(detail.item.attachments).toHaveLength(2);
    expect(detail.item.comments).toHaveLength(1);
  });

  it("supports settings, current actor, recurring templates, and route discovery", async () => {
    const adminHeaders = trustedHeader("admin2@example.com");

    const meResponse = await app.request("/api/v1/me", {
      headers: adminHeaders
    });
    expect(meResponse.status).toBe(200);
    const me = await parseJson<MeResponse>(meResponse);
    expect(me.actor.email).toBe("admin2@example.com");

    const usersResponse = await app.request("/api/v1/users", {
      headers: adminHeaders
    });
    expect(usersResponse.status).toBe(200);
    const users = await parseJson<UsersResponse>(usersResponse);
    expect(users.items).toHaveLength(3);
    expect(
      users.items.some(
        (user) => user.role === "service" && user.serviceKind === "assistant"
      )
    ).toBe(true);

    const settingsPatchResponse = await app.request(
      "/api/v1/settings",
      jsonRequest({
        body: {
          defaultCalendarExportKind: "ics",
          doneArchiveAfterDays: 14
        },
        headers: adminHeaders,
        method: "PATCH"
      })
    );
    expect(settingsPatchResponse.status).toBe(200);
    const settingsPatch = await parseJson<SettingsResponse>(settingsPatchResponse);
    expect(settingsPatch.settings.defaultCalendarExportKind).toBe("ics");
    expect(settingsPatch.settings.doneArchiveAfterDays).toBe(14);

    const labelResponse = await app.request(
      "/api/v1/labels",
      jsonRequest({
        body: {
          name: "Weekly"
        },
        headers: adminHeaders,
        method: "POST"
      })
    );
    const label = await parseJson<LabelResponse>(labelResponse);

    const templateResponse = await app.request(
      "/api/v1/recurring-templates",
      jsonRequest({
        body: {
          aiAssistanceEnabledDefault: false,
          checklistItems: [{ body: "Check fridge" }],
          defaultDueTime: "09:00",
          description: "Restock the basics.",
          isActive: true,
          labelIds: [label.item.id],
          nextOccurrenceOn: "2026-03-25",
          recurrenceCadence: "weekly",
          recurrenceInterval: 1,
          title: "Plan weekly grocery run"
        },
        headers: adminHeaders,
        method: "POST"
      })
    );
    expect(templateResponse.status).toBe(201);
    const template = await parseJson<TemplateResponse>(templateResponse);
    expect(template.item.labels).toHaveLength(1);
    expect(template.item.checklistItems).toHaveLength(1);

    const listTemplatesResponse = await app.request("/api/v1/recurring-templates", {
      headers: adminHeaders
    });
    expect(listTemplatesResponse.status).toBe(200);
    const templateList = await parseJson<TemplateListResponse>(
      listTemplatesResponse
    );
    expect(templateList.items).toHaveLength(1);

    const patchTemplateResponse = await app.request(
      `/api/v1/recurring-templates/${template.item.id}`,
      jsonRequest({
        body: {
          aiAssistanceEnabledDefault: true,
          checklistItems: [{ body: "Check fridge" }, { body: "Check pantry" }],
          defaultDueTime: "10:00",
          description: "Restock the basics and household staples.",
          isActive: true,
          labelIds: [label.item.id],
          nextOccurrenceOn: "2026-04-01",
          recurrenceCadence: "weekly",
          recurrenceInterval: 1,
          title: "Plan grocery run"
        },
        headers: adminHeaders,
        method: "PATCH"
      })
    );
    expect(patchTemplateResponse.status).toBe(200);
    const patchedTemplate = await parseJson<TemplateResponse>(
      patchTemplateResponse
    );
    expect(patchedTemplate.item.aiAssistanceEnabledDefault).toBe(true);
    expect(patchedTemplate.item.checklistItems).toHaveLength(2);

    const openApiResponse = await app.request("/api/v1/openapi.json", {
      headers: adminHeaders
    });
    expect(openApiResponse.status).toBe(200);
    const openApi = await parseJson<OpenApiResponse>(openApiResponse);
    expect(openApi.paths["/api/v1/tasks/{taskId}/status"]).toContain("post");
    expect(openApi.paths["/api/v1/users/{userId}/service-tokens"]).toContain("post");
  });

  it("supports managing household actors and assistant tokens", async () => {
    const adminHeaders = trustedHeader("admin1@example.com");

    const createAdminUserResponse = await app.request(
      "/api/v1/users",
      jsonRequest({
        body: {
          displayName: "Rachel",
          email: "rachel@example.com",
          role: "admin"
        },
        headers: adminHeaders,
        method: "POST"
      })
    );
    expect(createAdminUserResponse.status).toBe(201);
    const createdAdminUser = await parseJson<UserResponse>(createAdminUserResponse);
    expect(createdAdminUser.item.email).toBe("rachel@example.com");

    const createAssistantResponse = await app.request(
      "/api/v1/users",
      jsonRequest({
        body: {
          displayName: "Ada",
          role: "service",
          serviceKind: "assistant"
        },
        headers: adminHeaders,
        method: "POST"
      })
    );
    expect(createAssistantResponse.status).toBe(201);
    const createdAssistant = await parseJson<UserResponse>(createAssistantResponse);

    const issueTokenResponse = await app.request(
      `/api/v1/users/${createdAssistant.item.id}/service-tokens`,
      jsonRequest({
        body: {
          name: "Ada exe.dev"
        },
        headers: adminHeaders,
        method: "POST"
      })
    );
    expect(issueTokenResponse.status).toBe(201);
    const issuedToken = await parseJson<ServiceTokenResponse>(issueTokenResponse);
    expect(issuedToken.plainTextToken).toContain("swntd_st_");

    const createTaskResponse = await app.request(
      "/api/v1/tasks",
      jsonRequest({
        body: {
          aiAssistanceEnabled: true,
          assigneeUserId: createdAssistant.item.id,
          title: "Ada-owned task"
        },
        headers: adminHeaders,
        method: "POST"
      })
    );
    expect(createTaskResponse.status).toBe(201);
    const createdTask = await parseJson<TaskItemResponse>(createTaskResponse);

    const deactivateAssistantResponse = await app.request(
      `/api/v1/users/${createdAssistant.item.id}`,
      jsonRequest({
        body: {
          deactivated: true
        },
        headers: adminHeaders,
        method: "PATCH"
      })
    );
    expect(deactivateAssistantResponse.status).toBe(200);
    const deactivatedAssistant = await parseJson<UserResponse>(
      deactivateAssistantResponse
    );
    expect(deactivatedAssistant.item.deactivatedAt).toBeTruthy();

    const taskDetailAfterDeactivation = await app.request(
      `/api/v1/tasks/${createdTask.item.id}`,
      {
        headers: adminHeaders
      }
    );
    expect(taskDetailAfterDeactivation.status).toBe(200);
    const taskAfterDeactivation = await parseJson<TaskItemResponse>(
      taskDetailAfterDeactivation
    );
    expect(taskAfterDeactivation.item.assignee).toBeNull();

    const serviceTokensResponse = await app.request(
      `/api/v1/users/${createdAssistant.item.id}/service-tokens`,
      {
        headers: adminHeaders
      }
    );
    expect(serviceTokensResponse.status).toBe(200);
    const serviceTokens = await parseJson<ServiceTokenListResponse>(
      serviceTokensResponse
    );
    expect(serviceTokens.items).toHaveLength(1);
    expect(serviceTokens.items[0]?.revokedAt).toBeTruthy();

    const reactivateAssistantResponse = await app.request(
      `/api/v1/users/${createdAssistant.item.id}`,
      jsonRequest({
        body: {
          deactivated: false,
          displayName: "Ada Lovelace",
          serviceKind: "assistant"
        },
        headers: adminHeaders,
        method: "PATCH"
      })
    );
    expect(reactivateAssistantResponse.status).toBe(200);
    const reactivatedAssistant = await parseJson<UserResponse>(
      reactivateAssistantResponse
    );
    expect(reactivatedAssistant.item.deactivatedAt).toBeNull();
    expect(reactivatedAssistant.item.displayName).toBe("Ada Lovelace");

    const revokeTokenResponse = await app.request(
      `/api/v1/service-tokens/${issuedToken.item.id}/revoke`,
      {
        headers: adminHeaders,
        method: "POST"
      }
    );
    expect(revokeTokenResponse.status).toBe(200);
  });

  it("enforces service-actor permissions through the HTTP API", async () => {
    const adminHeaders = trustedHeader("admin1@example.com");
    const assistantUserId = await getAssistantActorId();

    const createEligibleTaskResponse = await app.request(
      "/api/v1/tasks",
      jsonRequest({
        body: {
          aiAssistanceEnabled: true,
          assigneeUserId: assistantUserId,
          title: "Draft grocery recap"
        },
        headers: adminHeaders,
        method: "POST"
      })
    );
    expect(createEligibleTaskResponse.status).toBe(201);
    const eligibleTask = await parseJson<TaskItemResponse>(
      createEligibleTaskResponse
    );

    const createHumanTaskResponse = await app.request(
      "/api/v1/tasks",
      jsonRequest({
        body: {
          title: "Human-only errand"
        },
        headers: adminHeaders,
        method: "POST"
      })
    );
    expect(createHumanTaskResponse.status).toBe(201);
    const humanTask = await parseJson<TaskItemResponse>(createHumanTaskResponse);

    const assistantToken = await issueAssistantBearerToken();
    const serviceHeaders = {
      authorization: `Bearer ${assistantToken}`
    };

    const meResponse = await app.request("/api/v1/me", {
      headers: serviceHeaders
    });
    expect(meResponse.status).toBe(200);
    const me = await parseJson<MeResponse>(meResponse);
    expect(me.actor.role).toBe("service");

    const createTaskAsServiceResponse = await app.request(
      "/api/v1/tasks",
      jsonRequest({
        body: {
          title: "Should fail"
        },
        headers: serviceHeaders,
        method: "POST"
      })
    );
    expect(createTaskAsServiceResponse.status).toBe(403);

    const settingsAsServiceResponse = await app.request("/api/v1/settings", {
      headers: serviceHeaders
    });
    expect(settingsAsServiceResponse.status).toBe(403);

    const usersAsServiceResponse = await app.request("/api/v1/users", {
      headers: serviceHeaders
    });
    expect(usersAsServiceResponse.status).toBe(403);

    const listTasksResponse = await app.request("/api/v1/tasks", {
      headers: serviceHeaders
    });
    expect(listTasksResponse.status).toBe(200);
    const taskList = await parseJson<TaskListResponse>(listTasksResponse);
    expect(taskList.total).toBe(1);
    expect(taskList.items).toHaveLength(1);
    expect(taskList.items[0]!.id).toBe(eligibleTask.item.id);

    const transitionResponse = await app.request(
      `/api/v1/tasks/${eligibleTask.item.id}/status`,
      jsonRequest({
        body: {
          expectedRevision: eligibleTask.item.revision,
          status: "In Progress"
        },
        headers: serviceHeaders,
        method: "POST"
      })
    );
    expect(transitionResponse.status).toBe(200);
    const transitionedTask = await parseJson<TaskItemResponse>(
      transitionResponse
    );
    expect(transitionedTask.item.status).toBe("In Progress");

    const commentResponse = await app.request(
      `/api/v1/tasks/${eligibleTask.item.id}/comments`,
      jsonRequest({
        body: {
          body: "Started drafting a summary."
        },
        headers: serviceHeaders,
        method: "POST"
      })
    );
    expect(commentResponse.status).toBe(201);

    const linkResponse = await app.request(
      `/api/v1/tasks/${eligibleTask.item.id}/attachment-links`,
      jsonRequest({
        body: {
          name: "Reference note",
          url: "https://example.com/reference"
        },
        headers: serviceHeaders,
        method: "POST"
      })
    );
    expect(linkResponse.status).toBe(201);

    const uploadForm = new FormData();
    uploadForm.set(
      "file",
      new File(["assistant upload"], "assistant.txt", { type: "text/plain" })
    );
    const uploadResponse = await app.request(
      `/api/v1/tasks/${eligibleTask.item.id}/uploads`,
      {
        body: uploadForm,
        headers: serviceHeaders,
        method: "POST"
      }
    );
    expect(uploadResponse.status).toBe(403);

    const forbiddenTaskResponse = await app.request(
      `/api/v1/tasks/${humanTask.item.id}`,
      {
        headers: serviceHeaders
      }
    );
    expect(forbiddenTaskResponse.status).toBe(403);
  });
});
