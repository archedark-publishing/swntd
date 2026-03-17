import { workspaceMessage } from "@swntd/shared";

export function createApiBanner() {
  return `API bootstrap ready: ${workspaceMessage}`;
}

if (process.argv[1]?.endsWith("index.ts")) {
  console.log(createApiBanner());
}
