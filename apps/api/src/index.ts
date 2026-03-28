import { serve } from "@hono/node-server";
import { fileURLToPath } from "node:url";
import { getApiConfig } from "./config";
import { createApp } from "./app";
import { startInternalJobScheduler } from "./jobs/scheduler";

export function createApiBanner() {
  const config = getApiConfig();

  return `SWNTD API listening on http://${config.apiHost}:${config.apiPort}`;
}

export async function startApiServer() {
  const config = getApiConfig();
  const app = createApp();
  const scheduler = await startInternalJobScheduler();

  const server = serve(
    {
      fetch: app.fetch,
      hostname: config.apiHost,
      port: config.apiPort
    },
    () => {
      console.log(createApiBanner());

      if (scheduler) {
        console.log(
          `SWNTD internal lifecycle jobs enabled (${config.internalJobsIntervalSeconds}s interval)`
        );
      }
    }
  );

  const shutdown = async () => {
    await scheduler?.stop();
  };

  process.once("SIGINT", () => {
    void shutdown();
  });

  process.once("SIGTERM", () => {
    void shutdown();
  });

  return server;
}

const currentFilePath = fileURLToPath(import.meta.url);

if (process.argv[1] && currentFilePath === process.argv[1]) {
  void startApiServer();
}
