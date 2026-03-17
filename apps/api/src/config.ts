import "dotenv/config";
import { parseSwntdConfig } from "@swntd/shared/server/config";
import { z } from "zod";

const apiConfigSchema = z.object({
  SWNTD_API_HOST: z.string().trim().min(1).default("0.0.0.0"),
  SWNTD_API_PORT: z.coerce.number().int().positive().default(3001)
});

export function getApiConfig(env: NodeJS.ProcessEnv = process.env) {
  const sharedConfig = parseSwntdConfig(env);
  const apiConfig = apiConfigSchema.parse(env);

  return {
    ...sharedConfig,
    apiHost: apiConfig.SWNTD_API_HOST,
    apiPort: apiConfig.SWNTD_API_PORT
  };
}
