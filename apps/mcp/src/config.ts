import "dotenv/config";
import { z } from "zod";

const mcpConfigSchema = z.object({
  SWNTD_MCP_SERVICE_TOKEN: z.string().trim().min(1),
  SWNTD_MCP_SERVER_NAME: z.string().trim().min(1).default("swntd-mcp"),
  SWNTD_MCP_SERVER_VERSION: z.string().trim().min(1).default("0.1.0")
});

export function getMcpConfig(env: NodeJS.ProcessEnv = process.env) {
  const parsed = mcpConfigSchema.parse(env);

  return {
    serverName: parsed.SWNTD_MCP_SERVER_NAME,
    serverVersion: parsed.SWNTD_MCP_SERVER_VERSION,
    serviceToken: parsed.SWNTD_MCP_SERVICE_TOKEN
  };
}

export type McpConfig = ReturnType<typeof getMcpConfig>;
