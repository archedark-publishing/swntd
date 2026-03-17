import { eq } from "drizzle-orm";
import {
  households,
  householdSettings,
  users
} from "@swntd/shared/server/db/schema";
import { createDatabase } from "./client";

const DEFAULT_HOUSEHOLD_ID = "default-household";

function toDisplayName(email: string) {
  const localPart = email.split("@")[0] ?? "admin";

  return localPart
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

export async function bootstrapDatabase() {
  const { client, config, db } = await createDatabase();

  try {
    await db.transaction(async (tx) => {
      await tx
        .insert(households)
        .values({
          id: DEFAULT_HOUSEHOLD_ID,
          name: config.householdName
        })
        .onConflictDoUpdate({
          target: households.id,
          set: {
            name: config.householdName,
            updatedAt: new Date()
          }
        });

      await tx
        .insert(householdSettings)
        .values({
          householdId: DEFAULT_HOUSEHOLD_ID,
          doneArchiveAfterDays: config.doneArchiveAfterDays,
          defaultTimezone: config.defaultTimezone,
          defaultCalendarExportKind: config.defaultCalendarExportKind
        })
        .onConflictDoUpdate({
          target: householdSettings.householdId,
          set: {
            doneArchiveAfterDays: config.doneArchiveAfterDays,
            defaultTimezone: config.defaultTimezone,
            defaultCalendarExportKind: config.defaultCalendarExportKind,
            updatedAt: new Date()
          }
        });

      for (const email of config.bootstrapAdminEmails) {
        await tx
          .insert(users)
          .values({
            householdId: DEFAULT_HOUSEHOLD_ID,
            email,
            displayName: toDisplayName(email),
            role: "admin",
            serviceKind: null,
            externalAuthId: null
          })
          .onConflictDoUpdate({
            target: users.email,
            set: {
              householdId: DEFAULT_HOUSEHOLD_ID,
              displayName: toDisplayName(email),
              role: "admin",
              updatedAt: new Date()
            }
          });
      }

      const serviceExternalAuthId = `service:${config.serviceActorKind}`;

      await tx
        .insert(users)
        .values({
          householdId: DEFAULT_HOUSEHOLD_ID,
          email: null,
          displayName: config.serviceActorName,
          role: "service",
          serviceKind: config.serviceActorKind,
          externalAuthId: serviceExternalAuthId
        })
        .onConflictDoUpdate({
          target: users.externalAuthId,
          set: {
            householdId: DEFAULT_HOUSEHOLD_ID,
            displayName: config.serviceActorName,
            role: "service",
            serviceKind: config.serviceActorKind,
            updatedAt: new Date()
          }
        });
    });

    const seededUsers = await db
      .select({
        email: users.email,
        displayName: users.displayName,
        role: users.role,
        serviceKind: users.serviceKind
      })
      .from(users)
      .where(eq(users.householdId, DEFAULT_HOUSEHOLD_ID));

    return {
      householdId: DEFAULT_HOUSEHOLD_ID,
      householdName: config.householdName,
      seededUsers
    };
  } finally {
    client.close();
  }
}

if (import.meta.url === new URL(process.argv[1] ?? "", "file:").href) {
  const result = await bootstrapDatabase();
  console.log(JSON.stringify(result, null, 2));
}
