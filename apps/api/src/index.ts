import { serve } from "@hono/node-server";
import { fileURLToPath } from "node:url";
import { getApiConfig } from "./config";
import { createApp } from "./app";

export function createApiBanner() {
  const config = getApiConfig();

  return `SWNTD API listening on http://${config.apiHost}:${config.apiPort}`;
}

export function startApiServer() {
  const config = getApiConfig();
  const app = createApp();

  return serve(
    {
      fetch: app.fetch,
      hostname: config.apiHost,
      port: config.apiPort
    },
    () => {
      console.log(createApiBanner());
    }
  );
}

const currentFilePath = fileURLToPath(import.meta.url);

if (process.argv[1] && currentFilePath === process.argv[1]) {
  startApiServer();
}
