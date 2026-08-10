import "server-only";

import { and, desc, eq, gt, lte, ne, sql } from "drizzle-orm";

import { getDatabase } from "@/db/client";
import {
  auditEvents,
  driveConnections,
  driveDestinations,
  type Portal,
  portals,
} from "@/db/schema";
import { newId } from "@/lib/ids";

export type PortalRecord = Omit<Portal, "publicTokenHash">;

export type PortalProviderRecord = PortalRecord & {
  connectionStatus: "ACTIVE" | "REVOKED" | "ERROR";
  destinationStatus: "ACTIVE" | "INVALID" | "DISCONNECTED";
};

export type CreatePortalRecordResult =
  | { kind: "created"; portal: PortalRecord }
  | { kind: "destination_unavailable" }
  | { kind: "portal_already_open" };

export type TransitionPortalRecordResult =
  | { kind: "portal_already_open" }
  | { kind: "state_conflict" }
  | { kind: "updated"; portal: PortalRecord };

const portalRecordSelection = {
  allowedMimeTypes: portals.allowedMimeTypes,
  createdAt: portals.createdAt,
  destinationId: portals.destinationId,
  expiresAt: portals.expiresAt,
  id: portals.id,
  maxFilesPerSubmission: portals.maxFilesPerSubmission,
  maxFileSizeBytes: portals.maxFileSizeBytes,
  maxSubmissionBytes: portals.maxSubmissionBytes,
  name: portals.name,
  status: portals.status,
  updatedAt: portals.updatedAt,
};

const portalProviderSelection = {
  ...portalRecordSelection,
  connectionStatus: driveConnections.status,
  destinationStatus: driveDestinations.status,
};

export async function createPortalRecordForAdmin(input: {
  adminId: string;
  allowedMimeTypes: string[];
  expiresAt: Date;
  maxFileSizeBytes: number;
  maxFilesPerSubmission: number;
  maxSubmissionBytes: number;
  name: string;
  publicTokenHash: string;
}): Promise<CreatePortalRecordResult> {
  return getDatabase().transaction(async (transaction) => {
    await transaction.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${input.adminId}, 0))`,
    );

    const now = new Date();
    const existingOpenPortals = await transaction
      .select({
        expiresAt: portals.expiresAt,
        id: portals.id,
      })
      .from(portals)
      .innerJoin(
        driveDestinations,
        eq(portals.destinationId, driveDestinations.id),
      )
      .innerJoin(
        driveConnections,
        eq(driveDestinations.driveConnectionId, driveConnections.id),
      )
      .where(
        and(
          eq(driveConnections.adminId, input.adminId),
          eq(portals.status, "OPEN"),
        ),
      )
      .orderBy(desc(portals.createdAt));

    for (const existing of existingOpenPortals) {
      if (existing.expiresAt.getTime() > now.getTime()) {
        return { kind: "portal_already_open" };
      }

      const [expired] = await transaction
        .update(portals)
        .set({ status: "EXPIRED", updatedAt: now })
        .where(and(eq(portals.id, existing.id), eq(portals.status, "OPEN")))
        .returning({ id: portals.id });

      if (expired) {
        await transaction.insert(auditEvents).values({
          id: newId("audit"),
          actorType: "SYSTEM",
          eventType: "portal.expired",
          resourceType: "portal",
          resourceId: expired.id,
          metadata: { previousStatus: "OPEN" },
        });
      }
    }

    const [destination] = await transaction
      .select({ id: driveDestinations.id })
      .from(driveDestinations)
      .innerJoin(
        driveConnections,
        eq(driveDestinations.driveConnectionId, driveConnections.id),
      )
      .where(
        and(
          eq(driveConnections.adminId, input.adminId),
          eq(driveConnections.status, "ACTIVE"),
          eq(driveDestinations.status, "ACTIVE"),
        ),
      )
      .orderBy(desc(driveDestinations.updatedAt))
      .limit(1);

    if (!destination) {
      return { kind: "destination_unavailable" };
    }

    const [portal] = await transaction
      .insert(portals)
      .values({
        id: newId("portal"),
        destinationId: destination.id,
        name: input.name,
        publicTokenHash: input.publicTokenHash,
        status: "OPEN",
        expiresAt: input.expiresAt,
        allowedMimeTypes: input.allowedMimeTypes,
        maxFileSizeBytes: input.maxFileSizeBytes,
        maxFilesPerSubmission: input.maxFilesPerSubmission,
        maxSubmissionBytes: input.maxSubmissionBytes,
      })
      .returning(portalRecordSelection);

    await transaction.insert(auditEvents).values({
      id: newId("audit"),
      actorType: "ADMIN",
      actorId: input.adminId,
      eventType: "portal.created",
      resourceType: "portal",
      resourceId: portal.id,
      metadata: {
        destinationId: destination.id,
        expiresAt: input.expiresAt.toISOString(),
        maxFileSizeBytes: input.maxFileSizeBytes,
        maxFilesPerSubmission: input.maxFilesPerSubmission,
        maxSubmissionBytes: input.maxSubmissionBytes,
      },
    });

    return { kind: "created", portal };
  });
}

export async function findPortalByPublicTokenHash(
  publicTokenHash: string,
): Promise<PortalProviderRecord | undefined> {
  const [portal] = await getDatabase()
    .select(portalProviderSelection)
    .from(portals)
    .innerJoin(driveDestinations, eq(portals.destinationId, driveDestinations.id))
    .innerJoin(
      driveConnections,
      eq(driveDestinations.driveConnectionId, driveConnections.id),
    )
    .where(eq(portals.publicTokenHash, publicTokenHash))
    .limit(1);

  return portal;
}

export async function getPortalForAdmin(
  adminId: string,
  portalId: string,
): Promise<PortalProviderRecord | undefined> {
  const [portal] = await getDatabase()
    .select(portalProviderSelection)
    .from(portals)
    .innerJoin(driveDestinations, eq(portals.destinationId, driveDestinations.id))
    .innerJoin(
      driveConnections,
      eq(driveDestinations.driveConnectionId, driveConnections.id),
    )
    .where(and(eq(driveConnections.adminId, adminId), eq(portals.id, portalId)))
    .limit(1);

  return portal;
}

export async function listPortalRecordsForAdmin(
  adminId: string,
): Promise<PortalProviderRecord[]> {
  return getDatabase()
    .select(portalProviderSelection)
    .from(portals)
    .innerJoin(driveDestinations, eq(portals.destinationId, driveDestinations.id))
    .innerJoin(
      driveConnections,
      eq(driveDestinations.driveConnectionId, driveConnections.id),
    )
    .where(eq(driveConnections.adminId, adminId))
    .orderBy(desc(portals.createdAt));
}

export async function expirePortalRecord(
  portalId: string,
): Promise<PortalRecord | undefined> {
  return getDatabase().transaction(async (transaction) => {
    const now = new Date();
    const [expired] = await transaction
      .update(portals)
      .set({ status: "EXPIRED", updatedAt: now })
      .where(
        and(
          eq(portals.id, portalId),
          ne(portals.status, "EXPIRED"),
          lte(portals.expiresAt, now),
        ),
      )
      .returning(portalRecordSelection);

    if (!expired) {
      return undefined;
    }

    await transaction.insert(auditEvents).values({
      id: newId("audit"),
      actorType: "SYSTEM",
      eventType: "portal.expired",
      resourceType: "portal",
      resourceId: expired.id,
      metadata: { reason: "expiry_elapsed" },
    });

    return expired;
  });
}

export async function transitionPortalRecordForAdmin(input: {
  actorId: string;
  expectedStatus: Portal["status"];
  portalId: string;
  status: Portal["status"];
}): Promise<TransitionPortalRecordResult> {
  return getDatabase().transaction(async (transaction) => {
    await transaction.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${input.actorId}, 0))`,
    );

    const [owned] = await transaction
      .select({ id: portals.id })
      .from(portals)
      .innerJoin(driveDestinations, eq(portals.destinationId, driveDestinations.id))
      .innerJoin(
        driveConnections,
        eq(driveDestinations.driveConnectionId, driveConnections.id),
      )
      .where(
        and(
          eq(driveConnections.adminId, input.actorId),
          eq(portals.id, input.portalId),
        ),
      )
      .limit(1);

    if (!owned) {
      return { kind: "state_conflict" };
    }

    if (input.status === "OPEN") {
      const [otherOpenPortal] = await transaction
        .select({ id: portals.id })
        .from(portals)
        .innerJoin(
          driveDestinations,
          eq(portals.destinationId, driveDestinations.id),
        )
        .innerJoin(
          driveConnections,
          eq(driveDestinations.driveConnectionId, driveConnections.id),
        )
        .where(
          and(
            eq(driveConnections.adminId, input.actorId),
            eq(portals.status, "OPEN"),
            ne(portals.id, input.portalId),
            gt(portals.expiresAt, new Date()),
          ),
        )
        .limit(1);

      if (otherOpenPortal) {
        return { kind: "portal_already_open" };
      }
    }

    const now = new Date();
    const [updated] = await transaction
      .update(portals)
      .set({ status: input.status, updatedAt: now })
      .where(
        and(
          eq(portals.id, input.portalId),
          eq(portals.status, input.expectedStatus),
        ),
      )
      .returning(portalRecordSelection);

    if (!updated) {
      return { kind: "state_conflict" };
    }

    await transaction.insert(auditEvents).values({
      id: newId("audit"),
      actorType: "ADMIN",
      actorId: input.actorId,
      eventType: `portal.${input.status.toLowerCase()}`,
      resourceType: "portal",
      resourceId: input.portalId,
      metadata: { previousStatus: input.expectedStatus },
    });

    return { kind: "updated", portal: updated };
  });
}
