import { mkdir } from "node:fs/promises";
import path from "node:path";
import { createClient } from "@libsql/client";
import * as schema from "@swntd/shared/server/db/schema";
import { drizzle } from "drizzle-orm/libsql";
import { getApiConfig } from "../config";

function resolveLocalFilePath(databaseUrl: string) {
  if (!databaseUrl.startsWith("file:")) {
    return null;
  }

  const value = databaseUrl.slice("file:".length);

  return path.isAbsolute(value) ? value : path.resolve(process.cwd(), value);
}

export async function ensureDatabaseDirectory(databaseUrl: string) {
  const localFilePath = resolveLocalFilePath(databaseUrl);

  if (!localFilePath) {
    return;
  }

  await mkdir(path.dirname(localFilePath), { recursive: true });
}

export async function createDatabase() {
  const config = getApiConfig();

  await ensureDatabaseDirectory(config.databaseUrl);

  const client = createClient({
    url: config.databaseUrl
  });

  const db = drizzle(client, { schema });

  return { client, db, config };
}

export type DatabaseConnection = Awaited<ReturnType<typeof createDatabase>>;
export type DatabaseClient = DatabaseConnection["db"];
