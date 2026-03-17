import "dotenv/config";
import { defineConfig } from "drizzle-kit";

const databaseUrl =
  process.env.SWNTD_DATABASE_URL ?? "file:./data/swntd.sqlite";

export default defineConfig({
  dialect: "sqlite",
  schema: "../../packages/shared/src/server/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: databaseUrl
  },
  verbose: true,
  strict: true
});
