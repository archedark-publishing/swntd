import { z } from "zod";

export const authModes = [
  "local_dev",
  "trusted_header",
  "service_token"
] as const;

export const calendarExportKinds = ["google", "ics"] as const;

const rawConfigSchema = z.object({
  SWNTD_AUTH_MODE: z.enum(authModes).default("local_dev"),
  SWNTD_HOUSEHOLD_NAME: z.string().trim().min(1).default("My Household"),
  SWNTD_BOOTSTRAP_ADMIN_EMAILS: z
    .string()
    .trim()
    .min(1)
    .default("admin@example.com"),
  SWNTD_SERVICE_ACTOR_NAME: z
    .string()
    .trim()
    .min(1)
    .default("Household Assistant"),
  SWNTD_SERVICE_ACTOR_KIND: z.string().trim().min(1).default("assistant"),
  SWNTD_DEFAULT_TIMEZONE: z.string().trim().min(1).default("America/New_York"),
  SWNTD_DONE_ARCHIVE_AFTER_DAYS: z.coerce.number().int().positive().default(30),
  SWNTD_DEFAULT_CALENDAR_EXPORT_KIND: z
    .enum(calendarExportKinds)
    .default("google"),
  SWNTD_UPLOADS_DIR: z.string().trim().min(1).default("./data/uploads"),
  SWNTD_MAX_UPLOAD_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .default(20 * 1024 * 1024),
  SWNTD_STALE_UPLOAD_GRACE_HOURS: z.coerce.number().int().positive().default(24),
  SWNTD_DATABASE_URL: z
    .string()
    .trim()
    .min(1)
    .default("file:./data/swntd.sqlite")
});

function parseAdminEmails(value: string) {
  const emails = value
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);

  const emailSchema = z.array(z.string().email()).min(1);

  return emailSchema.parse(emails);
}

export function parseSwntdConfig(env: NodeJS.ProcessEnv = process.env) {
  const raw = rawConfigSchema.parse(env);

  return {
    authMode: raw.SWNTD_AUTH_MODE,
    householdName: raw.SWNTD_HOUSEHOLD_NAME,
    bootstrapAdminEmails: parseAdminEmails(raw.SWNTD_BOOTSTRAP_ADMIN_EMAILS),
    serviceActorName: raw.SWNTD_SERVICE_ACTOR_NAME,
    serviceActorKind: raw.SWNTD_SERVICE_ACTOR_KIND,
    defaultTimezone: raw.SWNTD_DEFAULT_TIMEZONE,
    doneArchiveAfterDays: raw.SWNTD_DONE_ARCHIVE_AFTER_DAYS,
    defaultCalendarExportKind: raw.SWNTD_DEFAULT_CALENDAR_EXPORT_KIND,
    uploadsDir: raw.SWNTD_UPLOADS_DIR,
    maxUploadBytes: raw.SWNTD_MAX_UPLOAD_BYTES,
    staleUploadGraceHours: raw.SWNTD_STALE_UPLOAD_GRACE_HOURS,
    databaseUrl: raw.SWNTD_DATABASE_URL
  };
}

export type SwntdConfig = ReturnType<typeof parseSwntdConfig>;
