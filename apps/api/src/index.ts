import { workspaceMessage } from "@swntd/shared";
import { getApiConfig } from "./config";

export function createApiBanner() {
  const config = getApiConfig();

  return `API bootstrap ready: ${workspaceMessage} (${config.authMode})`;
}

if (process.argv[1]?.endsWith("index.ts")) {
  console.log(createApiBanner());
}
