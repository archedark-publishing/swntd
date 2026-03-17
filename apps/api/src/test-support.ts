import os from "node:os";
import path from "node:path";
import { rm } from "node:fs/promises";
import { eq } from "drizzle-orm";
import { users } from "@swntd/shared/server/db/schema";
import { issueServiceToken } from "./auth/service-tokens";
import { createApp } from "./app";
import { bootstrapDatabase } from "./db/bootstrap";
import { createDatabase } from "./db/client";
import { migrateDatabase } from "./db/migrate";

const originalEnv = { ...process.env };

export async function setupApiTestEnvironment() {
  const databasePath = path.join(
    os.tmpdir(),
    `swntd-api-${crypto.randomUUID()}.sqlite`
  );
  const uploadsDir = path.join(os.tmpdir(), `swntd-uploads-${crypto.randomUUID()}`);

  process.env = {
    ...originalEnv,
    SWNTD_AUTH_MODE: "trusted_header",
    SWNTD_API_HOST: "127.0.0.1",
    SWNTD_API_PORT: "3001",
    SWNTD_BOOTSTRAP_ADMIN_EMAILS: "admin1@example.com,admin2@example.com",
    SWNTD_DATABASE_URL: `file:${databasePath}`,
    SWNTD_HOUSEHOLD_NAME: "API Test Household",
    SWNTD_MAX_UPLOAD_BYTES: `${20 * 1024 * 1024}`,
    SWNTD_SERVICE_ACTOR_KIND: "assistant",
    SWNTD_SERVICE_ACTOR_NAME: "Household Assistant",
    SWNTD_UPLOADS_DIR: uploadsDir
  };

  await migrateDatabase();
  await bootstrapDatabase();

  return {
    app: createApp(),
    databasePath,
    uploadsDir
  };
}

export async function teardownApiTestEnvironment(uploadsDir: string) {
  process.env = { ...originalEnv };
  await rm(uploadsDir, { force: true, recursive: true });
}

export function trustedHeader(email: string) {
  return {
    "x-exedev-email": email
  };
}

export async function issueAssistantBearerToken() {
  const { client, db } = await createDatabase();

  try {
    const serviceActor = await getAssistantActor(db);

    const token = await issueServiceToken({
      name: "api-test-assistant",
      userId: serviceActor.id,
      db
    });

    return token.token;
  } finally {
    client.close();
  }
}

export async function getAssistantActorId() {
  const { client, db } = await createDatabase();

  try {
    const serviceActor = await getAssistantActor(db);

    return serviceActor.id;
  } finally {
    client.close();
  }
}

async function getAssistantActor(db: Awaited<ReturnType<typeof createDatabase>>["db"]) {
  const [serviceActor] = await db
    .select({
      id: users.id
    })
    .from(users)
    .where(eq(users.serviceKind, "assistant"));

  if (!serviceActor) {
    throw new Error("Service actor was not seeded.");
  }

  return serviceActor;
}
