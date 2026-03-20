import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { inArray } from "drizzle-orm";
import { taskEvents } from "@swntd/shared/server/db/schema";
import { resolveRequestActor } from "../../api/src/auth/resolve-actor";
import { createDatabase } from "../../api/src/db/client";
import {
  createTask,
  listTasks,
  updateTask
} from "../../api/src/services/api";
import {
  getAssistantActorId,
  issueAssistantBearerToken,
  setupApiTestEnvironment,
  teardownApiTestEnvironment,
  trustedHeader
} from "../../api/src/test-support";
import { createMcpBanner, createSwntdMcpServer } from "./index";

type McpClient = Client;
type ToolResult = Awaited<ReturnType<Client["callTool"]>>;

describe("Phase 6 MCP server", () => {
  let uploadsDir: string;
  let client: McpClient | null = null;
  let closeServer: (() => Promise<void>) | null = null;

  beforeEach(async () => {
    const environment = await setupApiTestEnvironment();

    uploadsDir = environment.uploadsDir;
  });

  afterEach(async () => {
    await client?.close();
    await closeServer?.();
    await teardownApiTestEnvironment(uploadsDir);
    client = null;
    closeServer = null;
  });

  it("exposes only the approved tool surface and supports the service actor workflow", async () => {
    const { client: databaseClient, db } = await createDatabase();

    try {
      const adminActor = await resolveAdminActor(db);
      const assistantId = await getAssistantActorId();

      await createTask(db, adminActor, {
        aiAssistanceEnabled: false,
        title: "Human-only task"
      });

      const createdTask = await createTask(db, adminActor, {
        aiAssistanceEnabled: true,
        assigneeUserId: assistantId,
        checklistItems: [
          { body: "Gather supplies" },
          { body: "Finish the first pass" }
        ],
        description: "A task the household assistant should be allowed to pick up.",
        title: "Assistant-ready task"
      });

      const assistantToken = await issueAssistantBearerToken();
      await connectMcpClient(assistantToken);

      const listedTools = await client!.listTools();
      expect(listedTools.tools.map((tool) => tool.name).sort()).toEqual([
        "add_comment",
        "attach_link",
        "get_task",
        "list_my_tasks",
        "transition_task_status"
      ]);

      const listResult = await callTool("list_my_tasks", {});
      expect(listResult.isError).toBeFalsy();
      expect(listResult.structuredContent).toMatchObject({
        items: [
          {
            id: createdTask.item.id,
            status: "To Do",
            title: "Assistant-ready task"
          }
        ],
        total: 1
      });

      const taskResult = await callTool("get_task", {
        taskId: createdTask.item.id
      });
      expect(taskResult.isError).toBeFalsy();
      expect(taskResult.structuredContent).toMatchObject({
        item: {
          checklistItems: [
            { body: "Gather supplies" },
            { body: "Finish the first pass" }
          ],
          description: "A task the household assistant should be allowed to pick up.",
          id: createdTask.item.id,
          status: "To Do",
          title: "Assistant-ready task"
        }
      });

      const transitionedResult = await callTool("transition_task_status", {
        expectedRevision: createdTask.item.revision,
        status: "In Progress",
        taskId: createdTask.item.id
      });
      expect(transitionedResult.isError).toBeFalsy();
      expect(transitionedResult.structuredContent).toMatchObject({
        item: {
          id: createdTask.item.id,
          revision: 1,
          status: "In Progress"
        }
      });

      const commentResult = await callTool("add_comment", {
        body: "Picked this up through MCP.",
        taskId: createdTask.item.id
      });
      expect(commentResult.isError).toBeFalsy();
      expect(commentResult.structuredContent).toMatchObject({
        item: {
          comments: [
            {
              body: "Picked this up through MCP."
            }
          ]
        }
      });

      const attachmentResult = await callTool("attach_link", {
        name: "Reference doc",
        taskId: createdTask.item.id,
        url: "https://example.com/reference"
      });
      expect(attachmentResult.isError).toBeFalsy();
      expect(attachmentResult.structuredContent).toMatchObject({
        item: {
          attachments: [
            {
              externalUrl: "https://example.com/reference",
              originalName: "Reference doc",
              storageKind: "external_link"
            }
          ]
        }
      });

      const [events] = await Promise.all([
        db
          .select({
            eventType: taskEvents.eventType,
            payloadJson: taskEvents.payloadJson
          })
          .from(taskEvents)
          .where(
            inArray(taskEvents.eventType, [
              "task.status_changed",
              "task.comment_added",
              "task.attachment_linked"
            ])
          )
      ]);

      const mcpEvents = events.filter((event) => {
        const payload = JSON.parse(event.payloadJson) as { source?: string };
        return payload.source === "mcp";
      });

      expect(mcpEvents.map((event) => event.eventType).sort()).toEqual([
        "task.attachment_linked",
        "task.comment_added",
        "task.status_changed"
      ]);
    } finally {
      databaseClient.close();
    }
  });

  it("fails cleanly when assignment or AI assistance eligibility changes", async () => {
    const { client: databaseClient, db } = await createDatabase();

    try {
      const adminActor = await resolveAdminActor(db);
      const assistantId = await getAssistantActorId();

      const createdTask = await createTask(db, adminActor, {
        aiAssistanceEnabled: true,
        assigneeUserId: assistantId,
        title: "Ephemeral assistant task"
      });

      const assistantToken = await issueAssistantBearerToken();
      await connectMcpClient(assistantToken);

      const initialList = await listTasks(db, adminActor, {
        archived: "exclude",
        assigneeUserId: assistantId,
        limit: 20,
        offset: 0
      });
      expect(initialList.total).toBe(1);

      await updateTask(db, adminActor, createdTask.item.id, {
        aiAssistanceEnabled: false,
        assigneeUserId: assistantId,
        expectedRevision: createdTask.item.revision,
        title: "Ephemeral assistant task"
      });

      const listAfterDisable = await callTool("list_my_tasks", {});
      expect(listAfterDisable.isError).toBeFalsy();
      expect(listAfterDisable.structuredContent).toMatchObject({
        items: [],
        total: 0
      });

      const deniedTransition = await callTool("transition_task_status", {
        expectedRevision: 1,
        status: "In Progress",
        taskId: createdTask.item.id
      });
      expect(deniedTransition.isError).toBe(true);
      expect(firstText(deniedTransition)).toContain("do not have access");

      await updateTask(db, adminActor, createdTask.item.id, {
        aiAssistanceEnabled: true,
        assigneeUserId: null,
        expectedRevision: 1,
        title: "Ephemeral assistant task"
      });

      const deniedGet = await callTool("get_task", {
        taskId: createdTask.item.id
      });
      expect(deniedGet.isError).toBe(true);
      expect(firstText(deniedGet)).toContain("do not have access");
    } finally {
      databaseClient.close();
    }
  });

  it("creates a useful MCP startup banner", () => {
    expect(
      createMcpBanner({
        serverName: "swntd-mcp",
        serverVersion: "0.1.0"
      })
    ).toContain("swntd-mcp@0.1.0");
  });

  async function connectMcpClient(serviceToken: string) {
    process.env.SWNTD_MCP_SERVICE_TOKEN = serviceToken;
    const serverHandle = await createSwntdMcpServer();
    const nextClient = new Client(
      {
        name: "swntd-test-client",
        version: "0.1.0"
      },
      {
        capabilities: {}
      }
    );
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    await serverHandle.server.connect(serverTransport);
    await nextClient.connect(clientTransport);

    client = nextClient;
    closeServer = serverHandle.close;
  }

  async function callTool(name: string, args: Record<string, unknown>) {
    return client!.callTool({
      arguments: args,
      name
    });
  }
});

function firstText(result: ToolResult) {
  const content = Array.isArray(result.content)
    ? (result.content as Array<{ text?: string; type?: string }>)
    : [];
  const entry = content.find((item) => item.type === "text");

  return entry?.type === "text" ? entry.text : "";
}

async function resolveAdminActor(
  db: Awaited<ReturnType<typeof createDatabase>>["db"]
) {
  const actor = await resolveRequestActor(
    {
      headers: trustedHeader("admin1@example.com"),
      trustedProxy: true
    },
    db
  );

  if (!actor || actor.role !== "admin") {
    throw new Error("Unable to resolve the seeded admin actor.");
  }

  return actor;
}
