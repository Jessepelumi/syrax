import "server-only";

import { and, desc, eq, isNotNull, sql } from "drizzle-orm";

import { getDatabase } from "@/db/client";
import { auditEvents, driveConnections, driveDestinations } from "@/db/schema";
import { newId } from "@/lib/ids";

export async function saveDriveDestination(input: {
  adminId: string;
  connectionId: string;
  displayName: string;
  providerFolderId: string;
}) {
  return getDatabase().transaction(async (transaction) => {
    await transaction.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${input.connectionId}, 0))`,
    );

    const now = new Date();

    await transaction
      .update(driveDestinations)
      .set({ selectedAt: null, updatedAt: now })
      .where(
        and(
          eq(driveDestinations.driveConnectionId, input.connectionId),
          isNotNull(driveDestinations.selectedAt),
        ),
      );

    const [destination] = await transaction
      .insert(driveDestinations)
      .values({
        id: newId("destination"),
        driveConnectionId: input.connectionId,
        providerFolderId: input.providerFolderId,
        displayName: input.displayName,
        selectedAt: now,
        verifiedAt: now,
        status: "ACTIVE",
      })
      .onConflictDoUpdate({
        target: [
          driveDestinations.driveConnectionId,
          driveDestinations.providerFolderId,
        ],
        set: {
          displayName: input.displayName,
          selectedAt: now,
          status: "ACTIVE",
          updatedAt: now,
          verifiedAt: now,
        },
      })
      .returning();

    await transaction
      .update(driveConnections)
      .set({ lastVerifiedAt: now, status: "ACTIVE", updatedAt: now })
      .where(eq(driveConnections.id, input.connectionId));

    await transaction.insert(auditEvents).values({
      id: newId("audit"),
      actorType: "ADMIN",
      actorId: input.adminId,
      eventType: "drive.destination.verified",
      resourceType: "drive_destination",
      resourceId: destination.id,
      metadata: { displayName: input.displayName },
    });

    return destination;
  });
}

export async function getDriveDestinationForAdmin(adminId: string) {
  const [destination] = await getDatabase()
    .select({
      displayName: driveDestinations.displayName,
      status: driveDestinations.status,
      selectedAt: driveDestinations.selectedAt,
      verifiedAt: driveDestinations.verifiedAt,
    })
    .from(driveDestinations)
    .innerJoin(
      driveConnections,
      eq(driveDestinations.driveConnectionId, driveConnections.id),
    )
    .where(
      and(
        eq(driveConnections.adminId, adminId),
        isNotNull(driveDestinations.selectedAt),
      ),
    )
    .orderBy(desc(driveDestinations.selectedAt))
    .limit(1);

  return destination;
}

export async function getActiveDriveDestinationForAdmin(adminId: string) {
  const [destination] = await getDatabase()
    .select({
      id: driveDestinations.id,
      displayName: driveDestinations.displayName,
      driveConnectionId: driveDestinations.driveConnectionId,
      providerFolderId: driveDestinations.providerFolderId,
    })
    .from(driveDestinations)
    .innerJoin(
      driveConnections,
      eq(driveDestinations.driveConnectionId, driveConnections.id),
    )
    .where(
      and(
        eq(driveConnections.adminId, adminId),
        eq(driveConnections.status, "ACTIVE"),
        eq(driveDestinations.status, "ACTIVE"),
        isNotNull(driveDestinations.selectedAt),
      ),
    )
    .orderBy(desc(driveDestinations.selectedAt))
    .limit(1);

  return destination;
}
