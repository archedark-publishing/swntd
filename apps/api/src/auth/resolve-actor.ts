import { eq } from "drizzle-orm";
import type { AuthenticatedActor } from "@swntd/shared/server/domain/authorization";
import { users } from "@swntd/shared/server/db/schema";
import { getApiConfig } from "../config";
import { createDatabase } from "../db/client";
import { resolveServiceActorFromBearerToken } from "./service-tokens";

export type AuthRequestContext = {
  headers?: Record<string, string | undefined>;
  trustedProxy?: boolean;
};

function getHeader(
  headers: Record<string, string | undefined>,
  name: string
): string | undefined {
  const entry = Object.entries(headers).find(
    ([key]) => key.toLowerCase() === name.toLowerCase()
  );

  return entry?.[1];
}

function getBearerToken(headers: Record<string, string | undefined>) {
  const authorization = getHeader(headers, "authorization");

  if (!authorization?.startsWith("Bearer ")) {
    return null;
  }

  return authorization.slice("Bearer ".length).trim();
}

function toActor(row: {
  id: string;
  householdId: string;
  email: string | null;
  displayName: string;
  role: "admin" | "service";
  serviceKind: string | null;
}): Omit<AuthenticatedActor, "authStrategy"> {
  return {
    id: row.id,
    householdId: row.householdId,
    email: row.email,
    displayName: row.displayName,
    role: row.role,
    serviceKind: row.serviceKind
  };
}

export async function resolveRequestActor(
  request: AuthRequestContext = {}
): Promise<AuthenticatedActor | null> {
  const config = getApiConfig();
  const headers = request.headers ?? {};

  const bearerToken = getBearerToken(headers);

  if (bearerToken) {
    return resolveServiceActorFromBearerToken(bearerToken);
  }

  const { client, db } = await createDatabase();

  try {
    if (config.authMode === "trusted_header") {
      if (!request.trustedProxy) {
        return null;
      }

      const email = getHeader(headers, "x-exedev-email");

      if (!email) {
        return null;
      }

      const [user] = await db
        .select({
          id: users.id,
          householdId: users.householdId,
          email: users.email,
          displayName: users.displayName,
          role: users.role,
          serviceKind: users.serviceKind
        })
        .from(users)
        .where(eq(users.email, email.toLowerCase()));

      return user
        ? {
            ...toActor(user),
            authStrategy: "trusted_header"
          }
        : null;
    }

    if (config.authMode === "local_dev") {
      const devEmail =
        getHeader(headers, "x-swntd-dev-email") ??
        config.bootstrapAdminEmails[0] ??
        null;

      if (!devEmail) {
        return null;
      }

      const [user] = await db
        .select({
          id: users.id,
          householdId: users.householdId,
          email: users.email,
          displayName: users.displayName,
          role: users.role,
          serviceKind: users.serviceKind
        })
        .from(users)
        .where(eq(users.email, devEmail.toLowerCase()));

      return user
        ? {
            ...toActor(user),
            authStrategy: "local_dev"
          }
        : null;
    }

    return null;
  } finally {
    client.close();
  }
}
