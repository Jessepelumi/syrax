import "server-only";

import { and, desc, eq, gt, inArray, isNotNull, lte, ne, sql } from "drizzle-orm";

import { getDatabase } from "@/db/client";
import {
  auditEvents,
  driveConnections,
  driveDestinations,
  type Portal,
  portals,
  submissions,
} from "@/db/schema";
import { newId } from "@/lib/ids";

export type PortalRecord = Omit<Portal, "encryptedPublicToken" | "publicTokenHash">;

export type PortalProviderRecord = PortalRecord & {
  connectionStatus: "ACTIVE" | "REVOKED" | "ERROR";
  destinationStatus: "ACTIVE" | "INVALID" | "DISCONNECTED";
};

export type AdminPortalProviderRecord = PortalProviderRecord &
  Pick<Portal, "encryptedPublicToken" | "publicTokenHash">;

export type CreatePortalRecordResult =
  | { kind: "created"; portal: PortalRecord }
  | { kind: "destination_unavailable" }
  | { kind: "portal_already_open" };

export type TransitionPortalRecordResult =
  | { kind: "portal_already_open" }
  | { kind: "state_conflict" }
  | { kind: "updated"; portal: PortalRecord };

export type UpdatePortalExpiryRecordResult =
  | { kind: "expired" }
  | { kind: "invalid" }
  | { kind: "not_editable" }
  | { kind: "not_found" }
  | { kind: "state_conflict" }
  | { kind: "updated"; portal: PortalRecord };

export type DeletePortalRecordResult =
  | { kind: "deleted" }
  | { kind: "not_deletable" }
  | { kind: "not_found" };

const portalRecordSelection = {
  allowedMimeTypes: portals.allowedMimeTypes,
  createdAt: portals.createdAt,
  destinationId: portals.destinationId,
  expiresAt: portals.expiresAt,
  id: portals.id,
  maxFilesPerSubmission: portals.maxFilesPerSubmission,
  legacyMaxFileSizeBytes: portals.legacyMaxFileSizeBytes,
  maxImageBytesPerSubmission: portals.maxImageBytesPerSubmission,
  maxImageFileSizeBytes: portals.maxImageFileSizeBytes,
  maxSubmissionBytes: portals.maxSubmissionBytes,
  maxVideoBytesPerSubmission: portals.maxVideoBytesPerSubmission,
  maxVideoFileSizeBytes: portals.maxVideoFileSizeBytes,
  name: portals.name,
  status: portals.status,
  updatedAt: portals.updatedAt,
};

const portalProviderSelection = {
  ...portalRecordSelection,
  connectionStatus: driveConnections.status,
  destinationStatus: driveDestinations.status,
};

const adminPortalProviderSelection = {
  ...portalProviderSelection,
  encryptedPublicToken: portals.encryptedPublicToken,
  publicTokenHash: portals.publicTokenHash,
};

export async function createPortalRecordForAdmin(input: {
  adminId: string;
  allowedMimeTypes: string[];
  expiresAt: Date;
  maxImageBytesPerSubmission: number;
  maxImageFileSizeBytes: number;
  maxFilesPerSubmission: number;
  maxSubmissionBytes: number;
  maxVideoBytesPerSubmission: number;
  maxVideoFileSizeBytes: number;
  name: string;
  encryptedPublicToken: string;
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
          isNotNull(driveDestinations.selectedAt),
        ),
      )
      .orderBy(desc(driveDestinations.selectedAt))
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
        encryptedPublicToken: input.encryptedPublicToken,
        publicTokenHash: input.publicTokenHash,
        status: "OPEN",
        expiresAt: input.expiresAt,
        allowedMimeTypes: input.allowedMimeTypes,
        legacyMaxFileSizeBytes: Math.max(
          input.maxImageFileSizeBytes,
          input.maxVideoFileSizeBytes,
        ),
        maxImageBytesPerSubmission: input.maxImageBytesPerSubmission,
        maxImageFileSizeBytes: input.maxImageFileSizeBytes,
        maxFilesPerSubmission: input.maxFilesPerSubmission,
        maxSubmissionBytes: input.maxSubmissionBytes,
        maxVideoBytesPerSubmission: input.maxVideoBytesPerSubmission,
        maxVideoFileSizeBytes: input.maxVideoFileSizeBytes,
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
        maxImageBytesPerSubmission: input.maxImageBytesPerSubmission,
        maxImageFileSizeBytes: input.maxImageFileSizeBytes,
        maxFilesPerSubmission: input.maxFilesPerSubmission,
        maxSubmissionBytes: input.maxSubmissionBytes,
        maxVideoBytesPerSubmission: input.maxVideoBytesPerSubmission,
        maxVideoFileSizeBytes: input.maxVideoFileSizeBytes,
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
): Promise<AdminPortalProviderRecord | undefined> {
  const [portal] = await getDatabase()
    .select(adminPortalProviderSelection)
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
): Promise<AdminPortalProviderRecord[]> {
  return getDatabase()
    .select(adminPortalProviderSelection)
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

export async function updatePortalExpiryRecordForAdmin(input: {
  actorId: string;
  expiresAt: Date;
  portalId: string;
}): Promise<UpdatePortalExpiryRecordResult> {
  return getDatabase().transaction(async (transaction) => {
    await transaction.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${input.actorId}, 0))`,
    );

    const [owned] = await transaction
      .select({
        expiresAt: portals.expiresAt,
        status: portals.status,
      })
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
      return { kind: "not_found" };
    }

    const now = new Date();

    if (input.expiresAt.getTime() <= now.getTime()) {
      return { kind: "invalid" };
    }

    if (owned.status === "EXPIRED" || owned.expiresAt.getTime() <= now.getTime()) {
      if (owned.status !== "EXPIRED") {
        const [expired] = await transaction
          .update(portals)
          .set({ status: "EXPIRED", updatedAt: now })
          .where(
            and(
              eq(portals.id, input.portalId),
              eq(portals.status, owned.status),
              lte(portals.expiresAt, now),
            ),
          )
          .returning({ id: portals.id });

        if (expired) {
          await transaction.insert(auditEvents).values({
            id: newId("audit"),
            actorType: "SYSTEM",
            eventType: "portal.expired",
            resourceType: "portal",
            resourceId: input.portalId,
            metadata: { reason: "expiry_elapsed" },
          });
        }
      }

      return { kind: "expired" };
    }

    if (owned.status !== "OPEN" && owned.status !== "CLOSED") {
      return { kind: "not_editable" };
    }

    const [updated] = await transaction
      .update(portals)
      .set({ expiresAt: input.expiresAt, updatedAt: now })
      .where(
        and(
          eq(portals.id, input.portalId),
          eq(portals.status, owned.status),
          eq(portals.expiresAt, owned.expiresAt),
          gt(portals.expiresAt, now),
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
      eventType: "portal.expiry_changed",
      resourceType: "portal",
      resourceId: input.portalId,
      metadata: {
        expiresAt: input.expiresAt.toISOString(),
        previousExpiresAt: owned.expiresAt.toISOString(),
        status: owned.status,
      },
    });

    return { kind: "updated", portal: updated };
  });
}

export async function deleteInactivePortalRecordForAdmin(input: {
  actorId: string;
  portalId: string;
}): Promise<DeletePortalRecordResult> {
  return getDatabase().transaction(async (transaction) => {
    await transaction.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${input.actorId}, 0))`,
    );

    const [owned] = await transaction
      .select({ status: portals.status })
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
      return { kind: "not_found" };
    }

    if (owned.status !== "CLOSED" && owned.status !== "EXPIRED") {
      return { kind: "not_deletable" };
    }

    const deletedSubmissions = await transaction
      .delete(submissions)
      .where(eq(submissions.portalId, input.portalId))
      .returning({ id: submissions.id });
    const [deleted] = await transaction
      .delete(portals)
      .where(
        and(
          eq(portals.id, input.portalId),
          inArray(portals.status, ["CLOSED", "EXPIRED"]),
        ),
      )
      .returning({ id: portals.id });

    if (!deleted) {
      return { kind: "not_deletable" };
    }

    await transaction.insert(auditEvents).values({
      id: newId("audit"),
      actorType: "ADMIN",
      actorId: input.actorId,
      eventType: "portal.deleted",
      resourceType: "portal",
      resourceId: input.portalId,
      metadata: {
        deletedSubmissionCount: deletedSubmissions.length,
        previousStatus: owned.status,
      },
    });

    return { kind: "deleted" };
  });
}
