import { workspaceMessage } from "@swntd/shared";

export function createMcpBanner() {
  return `MCP bootstrap ready: ${workspaceMessage}`;
}

if (process.argv[1]?.endsWith("index.ts")) {
  console.log(createMcpBanner());
}
