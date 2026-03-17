import "dotenv/config";
import { parseSwntdConfig } from "@swntd/shared/server/config";

export function getApiConfig() {
  return parseSwntdConfig();
}
