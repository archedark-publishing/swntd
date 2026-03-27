import { createDatabase } from "../db/client";
import { getApiConfig } from "../config";
import { runAllLifecycleJobs } from "./lifecycle";

type InternalJobScheduler = {
  stop: () => Promise<void>;
};

export async function startInternalJobScheduler(): Promise<InternalJobScheduler | null> {
  const config = getApiConfig();

  if (!config.internalJobsEnabled) {
    return null;
  }

  const { client, db } = await createDatabase();
  let intervalId: NodeJS.Timeout | null = null;
  let isRunning = false;
  let stopped = false;

  const runCycle = async (trigger: "startup" | "interval") => {
    if (isRunning || stopped) {
      return;
    }

    isRunning = true;

    try {
      const summary = await runAllLifecycleJobs({
        config,
        db
      });

      if (
        summary.recurring.generatedOccurrences > 0 ||
        summary.archive.archivedTasks > 0 ||
        summary.cleanup.deletedFiles > 0
      ) {
        console.log(
          `[swntd-jobs] ${trigger} run completed`,
          JSON.stringify(summary)
        );
      }
    } catch (error) {
      console.error(
        `[swntd-jobs] ${trigger} run failed`,
        error instanceof Error ? error : new Error("Unknown lifecycle job error.")
      );
    } finally {
      isRunning = false;
    }
  };

  void runCycle("startup");

  intervalId = setInterval(() => {
    void runCycle("interval");
  }, config.internalJobsIntervalSeconds * 1000);

  return {
    async stop() {
      stopped = true;

      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }

      client.close();
    }
  };
}
