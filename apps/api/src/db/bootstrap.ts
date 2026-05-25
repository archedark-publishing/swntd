import { and, eq, isNull } from "drizzle-orm";
import {
  commitmentPeriods,
  households,
  householdSettings,
  retrospectiveTemplateRounds,
  retrospectiveTemplates,
  users
} from "@swntd/shared/server/db/schema";
import { createDatabase } from "./client";

export const DEFAULT_HOUSEHOLD_ID = "default-household";

export function toDisplayName(email: string) {
  const localPart = email.split("@")[0] ?? "admin";

  return localPart
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(date: Date, amount: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + amount);
  return next;
}

function addMonths(date: Date, amount: number) {
  const next = new Date(date);
  next.setUTCMonth(next.getUTCMonth() + amount);
  return next;
}

function toIsoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function computePreviousPeriodStartOn(args: {
  cadence: "weekly" | "monthly" | "quarterly" | "custom";
  closureOn: string;
  interval: number;
}) {
  const base = new Date(`${args.closureOn}T00:00:00.000Z`);

  switch (args.cadence) {
    case "weekly":
      return toIsoDate(addDays(base, args.interval * -7));
    case "quarterly":
      return toIsoDate(addMonths(base, args.interval * -3));
    case "custom":
    case "monthly":
      return toIsoDate(addMonths(base, -args.interval));
  }
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
          nearDueThresholdDays: 3,
          defaultTimezone: config.defaultTimezone,
          defaultCalendarExportKind: config.defaultCalendarExportKind,
          retrospectiveCadence: "monthly",
          retrospectiveCadenceInterval: 1,
          finalizedRetrospectiveEditPolicy: "locked"
        })
        .onConflictDoUpdate({
          target: householdSettings.householdId,
          set: {
            doneArchiveAfterDays: config.doneArchiveAfterDays,
            nearDueThresholdDays: 3,
            defaultTimezone: config.defaultTimezone,
            defaultCalendarExportKind: config.defaultCalendarExportKind,
            updatedAt: new Date()
          }
        });

      for (const email of config.bootstrapAdminEmails) {
        await tx
          .insert(users)
          .values({
            deactivatedAt: null,
            householdId: DEFAULT_HOUSEHOLD_ID,
            email,
            displayName: toDisplayName(email),
            role: "admin",
            serviceKind: null,
            externalAuthId: null
          })
          .onConflictDoNothing({
            target: users.email
          });
      }

      const serviceExternalAuthId = `service:${config.serviceActorKind}`;

      await tx
        .insert(users)
        .values({
          deactivatedAt: null,
          householdId: DEFAULT_HOUSEHOLD_ID,
          email: null,
          displayName: config.serviceActorName,
          role: "service",
          serviceKind: config.serviceActorKind,
          externalAuthId: serviceExternalAuthId
        })
        .onConflictDoNothing({
          target: users.externalAuthId
        });

      const [adminUser] = await tx
        .select({
          id: users.id
        })
        .from(users)
        .where(
          and(
            eq(users.householdId, DEFAULT_HOUSEHOLD_ID),
            eq(users.role, "admin"),
            isNull(users.deactivatedAt)
          )
        )
        .limit(1);

      if (adminUser) {
        const existingTemplates = await tx
          .select({
            id: retrospectiveTemplates.id
          })
          .from(retrospectiveTemplates)
          .where(eq(retrospectiveTemplates.householdId, DEFAULT_HOUSEHOLD_ID))
          .limit(1);

        let defaultTemplateId = existingTemplates[0]?.id ?? null;

        if (!defaultTemplateId) {
          const [template] = await tx
            .insert(retrospectiveTemplates)
            .values({
              householdId: DEFAULT_HOUSEHOLD_ID,
              name: "Starter retrospective",
              description: "A general-purpose review and planning flow.",
              isSystem: true,
              createdByUserId: adminUser.id,
              updatedByUserId: adminUser.id
            })
            .returning({
              id: retrospectiveTemplates.id
            });

          if (template) {
            defaultTemplateId = template.id;

            await tx.insert(retrospectiveTemplateRounds).values([
              {
                templateId: template.id,
                title: "Commitments",
                kind: "commitment_review",
                prompt: "Review how the previous period's commitments went.",
                sortOrder: 0
              },
              {
                templateId: template.id,
                title: "Lookback",
                kind: "task_lookback",
                prompt: "Look over what got done during the period.",
                sortOrder: 1
              },
              {
                templateId: template.id,
                title: "Topics",
                kind: "notes",
                prompt: "Talk through shared topics gathered before or during the retro.",
                sortOrder: 2,
                entryPhase: "both",
                privacy: "shared"
              },
              {
                templateId: template.id,
                title: "Next commitments",
                kind: "commitment_capture",
                prompt: "Choose commitments for the next period.",
                sortOrder: 3
              },
              {
                templateId: template.id,
                title: "Planning",
                kind: "notes",
                prompt: "Capture plans, scheduling notes, and next steps.",
                sortOrder: 4,
                entryPhase: "retrospective",
                privacy: "shared"
              },
              {
                templateId: template.id,
                title: "Highlights",
                kind: "notes",
                prompt: "Share moments worth remembering from the period.",
                sortOrder: 5,
                entryPhase: "commitment_period",
                privacy: "private_until_round"
              }
            ]);
          }
        }

        if (defaultTemplateId) {
          await tx
            .update(householdSettings)
            .set({
              defaultRetrospectiveTemplateId: defaultTemplateId,
              updatedAt: new Date()
            })
            .where(
              and(
                eq(householdSettings.householdId, DEFAULT_HOUSEHOLD_ID),
                isNull(householdSettings.defaultRetrospectiveTemplateId)
              )
            );
        }
      }

      const existingActivePeriods = await tx
        .select({
          id: commitmentPeriods.id
        })
        .from(commitmentPeriods)
        .where(
          and(
            eq(commitmentPeriods.householdId, DEFAULT_HOUSEHOLD_ID),
            eq(commitmentPeriods.status, "active")
          )
        )
        .limit(1);

      if (existingActivePeriods.length === 0) {
        const [settings] = await tx
          .select({
            cadence: householdSettings.retrospectiveCadence,
            interval: householdSettings.retrospectiveCadenceInterval
          })
          .from(householdSettings)
          .where(eq(householdSettings.householdId, DEFAULT_HOUSEHOLD_ID))
          .limit(1);
        const closureOn = todayIsoDate();
        const cadence = settings?.cadence ?? "monthly";
        const interval = settings?.interval ?? 1;

        await tx.insert(commitmentPeriods).values({
          householdId: DEFAULT_HOUSEHOLD_ID,
          periodStartOn: computePreviousPeriodStartOn({
            cadence,
            closureOn,
            interval
          }),
          closureOn
        });
      }
    });

    const [seededUsers, seededTemplates, seededPeriods] = await Promise.all([
      db
        .select({
          email: users.email,
          displayName: users.displayName,
          role: users.role,
          serviceKind: users.serviceKind
        })
        .from(users)
        .where(eq(users.householdId, DEFAULT_HOUSEHOLD_ID)),
      db
        .select({
          id: retrospectiveTemplates.id,
          name: retrospectiveTemplates.name
        })
        .from(retrospectiveTemplates)
        .where(eq(retrospectiveTemplates.householdId, DEFAULT_HOUSEHOLD_ID)),
      db
        .select({
          closureOn: commitmentPeriods.closureOn,
          id: commitmentPeriods.id,
          periodStartOn: commitmentPeriods.periodStartOn,
          status: commitmentPeriods.status
        })
        .from(commitmentPeriods)
        .where(eq(commitmentPeriods.householdId, DEFAULT_HOUSEHOLD_ID))
    ]);

    return {
      householdId: DEFAULT_HOUSEHOLD_ID,
      householdName: config.householdName,
      seededPeriods,
      seededTemplates,
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
