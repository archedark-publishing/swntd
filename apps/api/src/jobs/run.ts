import "dotenv/config";
import { getApiConfig } from "../config";
import { createDatabase } from "../db/client";
import { runAllLifecycleJobs } from "./lifecycle";

async function main() {
  const { client, db } = await createDatabase();
  const config = getApiConfig();

  try {
    const summary = await runAllLifecycleJobs({
      config,
      db
    });

    console.log(
      JSON.stringify(
        {
          ok: true,
          summary
        },
        null,
        2
      )
    );
  } finally {
    client.close();
  }
}

try {
  await main();
} catch (error) {
  console.error(
    JSON.stringify(
      {
        error:
          error instanceof Error
            ? {
                message: error.message,
                name: error.name,
                stack: error.stack
              }
            : {
                message: "Unknown error"
              },
        ok: false
      },
      null,
      2
    )
  );

  process.exitCode = 1;
}
