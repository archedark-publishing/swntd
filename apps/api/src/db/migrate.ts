import path from "node:path";
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/libsql/migrator";
import { createDatabase } from "./client";

const currentFile = fileURLToPath(import.meta.url);
const currentDir = path.dirname(currentFile);
const migrationsFolder = path.resolve(currentDir, "../../drizzle");

export async function migrateDatabase() {
  const { client, db } = await createDatabase();

  try {
    await migrate(db, {
      migrationsFolder
    });
  } finally {
    client.close();
  }
}

if (import.meta.url === new URL(process.argv[1] ?? "", "file:").href) {
  await migrateDatabase();
  console.log(`Applied migrations from ${migrationsFolder}.`);
}
