import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { getMcpConfig } from "./config";
import { createMcpBanner, createSwntdMcpServer } from "./server";

async function main() {
  const config = getMcpConfig();
  const { server } = await createSwntdMcpServer({
    config
  });
  const transport = new StdioServerTransport();

  await server.connect(transport);
}

if (import.meta.url === new URL(process.argv[1] ?? "", "file:").href) {
  await main();
}

export { createMcpBanner, createSwntdMcpServer };
