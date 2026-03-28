import "dotenv/config";
import { parseSwntdConfig } from "@swntd/shared/server/config";
import { z } from "zod";

const booleanishSchema = z
  .string()
  .trim()
  .toLowerCase()
  .transform((value) => {
    if (["1", "true", "yes", "on"].includes(value)) {
      return true;
    }

    if (["0", "false", "no", "off"].includes(value)) {
      return false;
    }

    throw new Error("Expected a boolean-like value.");
  });

const apiConfigSchema = z.object({
  SWNTD_API_HOST: z.string().trim().min(1).default("0.0.0.0"),
  SWNTD_API_PORT: z.coerce.number().int().positive().default(3001),
  SWNTD_INTERNAL_JOBS_ENABLED: booleanishSchema.optional(),
  SWNTD_INTERNAL_JOBS_INTERVAL_SECONDS: z.coerce.number().int().positive().default(60)
});

export function getApiConfig(env: NodeJS.ProcessEnv = process.env) {
  const sharedConfig = parseSwntdConfig(env);
  const apiConfig = apiConfigSchema.parse(env);

  return {
    ...sharedConfig,
    apiHost: apiConfig.SWNTD_API_HOST,
    apiPort: apiConfig.SWNTD_API_PORT,
    internalJobsEnabled:
      apiConfig.SWNTD_INTERNAL_JOBS_ENABLED ?? sharedConfig.authMode === "local_dev",
    internalJobsIntervalSeconds: apiConfig.SWNTD_INTERNAL_JOBS_INTERVAL_SECONDS
  };
}
