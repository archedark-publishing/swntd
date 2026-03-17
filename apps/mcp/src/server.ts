import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import type { AuthenticatedActor } from "@swntd/shared/server/domain/authorization";
import type {
  TaskDetailDto,
  TaskListItemDto
} from "../../api/src/services/api";
import {
  addAttachmentLinkToTask,
  addCommentToTask,
  getTaskDetail,
  listTasks,
  transitionTask,
  type TaskEventSource
} from "../../api/src/services/api";
import { getMcpConfig, type McpConfig } from "./config";
import { createDatabase } from "../../api/src/db/client";
import { resolveRequestActor } from "../../api/src/auth/resolve-actor";

const taskStatusSchema = z.enum(["To Do", "In Progress", "Waiting", "Done"]);

const taskSummarySchema = z.object({
  aiAssistanceEnabled: z.boolean(),
  attachmentCount: z.number().int().nonnegative(),
  checklistCompleted: z.number().int().nonnegative(),
  checklistTotal: z.number().int().nonnegative(),
  commentCount: z.number().int().nonnegative(),
  dueOn: z.string().nullable(),
  dueTime: z.string().nullable(),
  id: z.string(),
  labels: z.array(z.string()),
  revision: z.number().int().nonnegative(),
  status: taskStatusSchema,
  title: z.string()
});

const taskDetailSchema = z.object({
  aiAssistanceEnabled: z.boolean(),
  assignee: z
    .object({
      displayName: z.string(),
      id: z.string(),
      role: z.enum(["admin", "service"]),
      serviceKind: z.string().nullable()
    })
    .nullable(),
  attachments: z.array(
    z.object({
      downloadUrl: z.string().nullable(),
      externalUrl: z.string().nullable(),
      id: z.string(),
      originalName: z.string(),
      storageKind: z.enum(["upload", "external_link"])
    })
  ),
  checklistItems: z.array(
    z.object({
      body: z.string(),
      id: z.string(),
      isCompleted: z.boolean(),
      sortOrder: z.number().int()
    })
  ),
  comments: z.array(
    z.object({
      authorDisplayName: z.string(),
      body: z.string(),
      createdAt: z.string(),
      id: z.string()
    })
  ),
  description: z.string(),
  dueOn: z.string().nullable(),
  dueTime: z.string().nullable(),
  id: z.string(),
  labels: z.array(z.string()),
  revision: z.number().int().nonnegative(),
  status: taskStatusSchema,
  title: z.string()
});

const listMyTasksOutputSchema = z.object({
  items: z.array(taskSummarySchema),
  total: z.number().int().nonnegative()
});

const taskMutationOutputSchema = z.object({
  item: taskDetailSchema
});

type McpDependencies = {
  config?: McpConfig;
};

export async function createSwntdMcpServer(
  dependencies: McpDependencies = {}
) {
  const config = dependencies.config ?? getMcpConfig();
  const database = await createDatabase();
  const server = new McpServer({
    name: config.serverName,
    version: config.serverVersion
  });

  server.registerTool(
    "list_my_tasks",
    {
      annotations: {
        readOnlyHint: true
      },
      description: "List open SWNTD tasks currently assigned to the authenticated service actor.",
      inputSchema: {
        limit: z.number().int().positive().max(100).optional(),
        query: z.string().trim().min(1).max(200).optional(),
        status: taskStatusSchema.optional()
      },
      outputSchema: listMyTasksOutputSchema
    },
    async (input) =>
      withActor(database.db, config, async (actor) => {
        const result = await listTasks(database.db, actor, {
          archived: "exclude",
          limit: input.limit ?? 50,
          offset: 0,
          query: input.query,
          status: input.status
        });

        const structuredContent = {
          items: result.items.map(mapTaskSummary),
          total: result.total
        };

        return okResult(
          structuredContent,
          `Found ${structuredContent.total} task${structuredContent.total === 1 ? "" : "s"}.`
        );
      })
  );

  server.registerTool(
    "get_task",
    {
      annotations: {
        readOnlyHint: true
      },
      description: "Get the full details for an assigned SWNTD task.",
      inputSchema: {
        taskId: z.string().trim().min(1)
      },
      outputSchema: taskMutationOutputSchema
    },
    async (input) =>
      withActor(database.db, config, async (actor) => {
        const result = await getTaskDetail(database.db, actor, input.taskId);

        return okResult(
          {
            item: mapTaskDetail(result.item)
          },
          `Loaded task ${result.item.title}.`
        );
      })
  );

  server.registerTool(
    "transition_task_status",
    {
      description:
        "Move an assigned SWNTD task between To Do, In Progress, Waiting, and Done.",
      inputSchema: {
        expectedRevision: z.number().int().nonnegative(),
        status: taskStatusSchema,
        taskId: z.string().trim().min(1)
      },
      outputSchema: taskMutationOutputSchema
    },
    async (input) =>
      withActor(database.db, config, async (actor) => {
        const result = await transitionTask(
          database.db,
          actor,
          input.taskId,
          {
            expectedRevision: input.expectedRevision,
            status: input.status
          },
          {
            eventSource: "mcp"
          }
        );

        return okResult(
          {
            item: mapTaskDetail(result.item)
          },
          `Moved task to ${result.item.status}.`
        );
      })
  );

  server.registerTool(
    "add_comment",
    {
      description: "Add a comment to an assigned SWNTD task.",
      inputSchema: {
        body: z.string().trim().min(1).max(4000),
        taskId: z.string().trim().min(1)
      },
      outputSchema: taskMutationOutputSchema
    },
    async (input) =>
      withActor(database.db, config, async (actor) => {
        const result = await addCommentToTask(
          database.db,
          actor,
          input.taskId,
          {
            body: input.body
          },
          {
            eventSource: "mcp"
          }
        );

        return okResult(
          {
            item: mapTaskDetail(result.item)
          },
          "Added comment."
        );
      })
  );

  server.registerTool(
    "attach_link",
    {
      description: "Attach an external link to an assigned SWNTD task.",
      inputSchema: {
        name: z.string().trim().min(1).max(200),
        taskId: z.string().trim().min(1),
        url: z.url()
      },
      outputSchema: taskMutationOutputSchema
    },
    async (input) =>
      withActor(database.db, config, async (actor) => {
        const result = await addAttachmentLinkToTask(
          database.db,
          actor,
          input.taskId,
          {
            name: input.name,
            url: input.url
          },
          {
            eventSource: "mcp"
          }
        );

        return okResult(
          {
            item: mapTaskDetail(result.item)
          },
          "Attached link."
        );
      })
  );

  return {
    async close() {
      await server.close();
      database.client.close();
    },
    config,
    server
  };
}

async function withActor(
  db: Awaited<ReturnType<typeof createDatabase>>["db"],
  config: McpConfig,
  handler: (actor: AuthenticatedActor) => Promise<CallToolResult>
) {
  try {
    const actor = await resolveServiceActor(db, config.serviceToken);

    return await handler(actor);
  } catch (error) {
    return errorResult(error);
  }
}

async function resolveServiceActor(
  db: Awaited<ReturnType<typeof createDatabase>>["db"],
  serviceToken: string
) {
  const actor = await resolveRequestActor(
    {
      headers: {
        authorization: `Bearer ${serviceToken}`
      }
    },
    db
  );

  if (!actor || actor.role !== "service") {
    throw new Error("Unable to resolve an authenticated service actor for the MCP server.");
  }

  return actor;
}

function okResult(
  structuredContent: Record<string, unknown>,
  message: string
): CallToolResult {
  return {
    content: [
      {
        text: message,
        type: "text"
      }
    ],
    structuredContent
  };
}

function errorResult(error: unknown): CallToolResult {
  return {
    content: [
      {
        text: error instanceof Error ? error.message : "Unexpected MCP server error.",
        type: "text"
      }
    ],
    isError: true
  };
}

function mapTaskSummary(task: TaskListItemDto) {
  return {
    aiAssistanceEnabled: task.aiAssistanceEnabled,
    attachmentCount: task.attachmentCount,
    checklistCompleted: task.checklistProgress.completed,
    checklistTotal: task.checklistProgress.total,
    commentCount: task.commentCount,
    dueOn: task.dueOn,
    dueTime: task.dueTime,
    id: task.id,
    labels: task.labels.map((label) => label.name),
    revision: task.revision,
    status: task.status,
    title: task.title
  };
}

function mapTaskDetail(task: TaskDetailDto) {
  return {
    aiAssistanceEnabled: task.aiAssistanceEnabled,
    assignee: task.assignee
      ? {
          displayName: task.assignee.displayName,
          id: task.assignee.id,
          role: task.assignee.role,
          serviceKind: task.assignee.serviceKind
        }
      : null,
    attachments: task.attachments.map((attachment) => ({
      downloadUrl: attachment.downloadUrl,
      externalUrl: attachment.externalUrl,
      id: attachment.id,
      originalName: attachment.originalName,
      storageKind: attachment.storageKind
    })),
    checklistItems: task.checklistItems.map((item) => ({
      body: item.body,
      id: item.id,
      isCompleted: item.isCompleted,
      sortOrder: item.sortOrder
    })),
    comments: task.comments.map((comment) => ({
      authorDisplayName: comment.author.displayName,
      body: comment.body,
      createdAt: comment.createdAt.toISOString(),
      id: comment.id
    })),
    description: task.description,
    dueOn: task.dueOn,
    dueTime: task.dueTime,
    id: task.id,
    labels: task.labels.map((label) => label.name),
    revision: task.revision,
    status: task.status,
    title: task.title
  };
}

export function createMcpBanner(config: Pick<McpConfig, "serverName" | "serverVersion">) {
  return `SWNTD MCP listening via stdio as ${config.serverName}@${config.serverVersion}`;
}

export type { TaskEventSource };
