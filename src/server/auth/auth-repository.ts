import "server-only";

import { and, eq, or } from "drizzle-orm";

import { getDatabase } from "@/db/client";
import { admins, auditEvents, driveConnections } from "@/db/schema";
import { newId } from "@/lib/ids";

interface SaveGoogleConnectionInput {
  email: string;
  encryptedRefreshToken?: string;
  googleSubject: string;
  grantedScopes: string[];
  tokenVersion: string;
}

export class AdminIdentityMismatchError extends Error {
  constructor() {
    super("Configured admin identity does not match stored Google identity");
    this.name = "AdminIdentityMismatchError";
  }
}

export class MissingRefreshTokenError extends Error {
  constructor() {
    super("Google did not return a refresh token for the initial connection");
    this.name = "MissingRefreshTokenError";
  }
}

export async function saveGoogleConnection(input: SaveGoogleConnectionInput): Promise<{
  adminId: string;
  connectionId: string;
}> {
  return getDatabase().transaction(async (transaction) => {
    const [existingAdmin] = await transaction
      .select()
      .from(admins)
      .where(
        or(eq(admins.email, input.email), eq(admins.googleSubject, input.googleSubject)),
      )
      .limit(1);

    if (
      existingAdmin &&
      (existingAdmin.email !== input.email || existingAdmin.googleSubject !== input.googleSubject)
    ) {
      throw new AdminIdentityMismatchError();
    }

    const adminId = existingAdmin?.id ?? newId("admin");
    const now = new Date();

    if (existingAdmin) {
      await transaction.update(admins).set({ lastLoginAt: now }).where(eq(admins.id, adminId));
    } else {
      await transaction.insert(admins).values({
        id: adminId,
        email: input.email,
        googleSubject: input.googleSubject,
        lastLoginAt: now,
      });
    }

    const [existingConnection] = await transaction
      .select()
      .from(driveConnections)
      .where(eq(driveConnections.adminId, adminId))
      .limit(1);

    const encryptedRefreshToken =
      input.encryptedRefreshToken ?? existingConnection?.encryptedRefreshToken;

    if (!encryptedRefreshToken) {
      throw new MissingRefreshTokenError();
    }

    const connectionId = existingConnection?.id ?? newId("driveconn");

    if (existingConnection) {
      await transaction
        .update(driveConnections)
        .set({
          encryptedRefreshToken,
          grantedScopes: input.grantedScopes,
          lastVerifiedAt: now,
          status: "ACTIVE",
          tokenVersion: input.tokenVersion,
          updatedAt: now,
        })
        .where(eq(driveConnections.id, connectionId));
    } else {
      await transaction.insert(driveConnections).values({
        id: connectionId,
        adminId,
        encryptedRefreshToken,
        grantedScopes: input.grantedScopes,
        lastVerifiedAt: now,
        status: "ACTIVE",
        tokenVersion: input.tokenVersion,
      });
    }

    await transaction.insert(auditEvents).values({
      id: newId("audit"),
      actorType: "ADMIN",
      actorId: adminId,
      eventType: existingConnection ? "drive.connection.reconnected" : "drive.connection.created",
      resourceType: "drive_connection",
      resourceId: connectionId,
      metadata: { scopeCount: input.grantedScopes.length },
    });

    return { adminId, connectionId };
  });
}

export async function getActiveDriveConnection(adminId: string) {
  const [connection] = await getDatabase()
    .select()
    .from(driveConnections)
    .where(
      and(eq(driveConnections.adminId, adminId), eq(driveConnections.status, "ACTIVE")),
    )
    .limit(1);

  return connection;
}

export async function markDriveConnectionStatus(
  connectionId: string,
  status: "ACTIVE" | "ERROR" | "REVOKED",
): Promise<void> {
  await getDatabase()
    .update(driveConnections)
    .set({ status, updatedAt: new Date() })
    .where(eq(driveConnections.id, connectionId));
}
