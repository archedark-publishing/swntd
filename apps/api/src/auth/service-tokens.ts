import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { and, eq, gt, isNull, or } from "drizzle-orm";
import { serviceTokens, users } from "@swntd/shared/server/db/schema";
import type { AuthenticatedActor } from "@swntd/shared/server/domain/authorization";
import { createDatabase } from "../db/client";

export function createServiceTokenSecret() {
  return `swntd_st_${randomBytes(24).toString("base64url")}`;
}

export function hashServiceToken(secret: string) {
  return createHash("sha256").update(secret).digest("base64url");
}

export function verifyServiceToken(secret: string, tokenHash: string) {
  const provided = Buffer.from(hashServiceToken(secret));
  const stored = Buffer.from(tokenHash);

  return provided.length === stored.length && timingSafeEqual(provided, stored);
}

export async function issueServiceToken(args: {
  userId: string;
  name: string;
  expiresAt?: Date;
}) {
  const { client, db } = await createDatabase();

  try {
    const [user] = await db
      .select({
        id: users.id,
        role: users.role
      })
      .from(users)
      .where(eq(users.id, args.userId));

    if (!user || user.role !== "service") {
      throw new Error("Service tokens can only be issued for service actors.");
    }

    const secret = createServiceTokenSecret();
    const tokenHash = hashServiceToken(secret);
    const [created] = await db
      .insert(serviceTokens)
      .values({
        userId: args.userId,
        name: args.name,
        tokenHash,
        expiresAt: args.expiresAt ?? null
      })
      .returning({
        id: serviceTokens.id,
        userId: serviceTokens.userId,
        name: serviceTokens.name
      });

    return {
      token: secret,
      record: created
    };
  } finally {
    client.close();
  }
}

export async function resolveServiceActorFromBearerToken(token: string) {
  const { client, db } = await createDatabase();

  try {
    const tokenHash = hashServiceToken(token);
    const now = new Date();

    const [match] = await db
      .select({
        tokenId: serviceTokens.id,
        userId: users.id,
        householdId: users.householdId,
        email: users.email,
        displayName: users.displayName,
        role: users.role,
        serviceKind: users.serviceKind
      })
      .from(serviceTokens)
      .innerJoin(users, eq(serviceTokens.userId, users.id))
      .where(
        and(
          eq(serviceTokens.tokenHash, tokenHash),
          isNull(serviceTokens.revokedAt),
          isNull(users.email),
          or(isNull(serviceTokens.expiresAt), gt(serviceTokens.expiresAt, now))
        )
      );

    if (!match || match.role !== "service") {
      return null;
    }

    await db
      .update(serviceTokens)
      .set({
        lastUsedAt: new Date()
      })
      .where(eq(serviceTokens.id, match.tokenId));

    const actor: AuthenticatedActor = {
      id: match.userId,
      householdId: match.householdId,
      role: match.role,
      email: match.email,
      displayName: match.displayName,
      serviceKind: match.serviceKind,
      authStrategy: "service_token"
    };

    return actor;
  } finally {
    client.close();
  }
}
