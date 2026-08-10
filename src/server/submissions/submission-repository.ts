import "server-only";

import { and, eq, gt } from "drizzle-orm";

import { getDatabase } from "@/db/client";
import {
  auditEvents,
  driveConnections,
  driveDestinations,
  portals,
  submissions,
  uploadFiles,
} from "@/db/schema";
import { newId } from "@/lib/ids";

export interface NewUploadFileRecord {
  clientFileId: string;
  declaredMimeType: string;
  declaredSizeBytes: number;
  destinationName: string;
  id: string;
  originalName: string;
}

export interface CreatedSubmissionRecord {
  fileIds: Array<{ clientFileId: string; fileId: string }>;
  submissionId: string;
}

export async function createSubmissionRecord(input: {
  files: NewUploadFileRecord[];
  guestName?: string;
  portalId: string;
  submissionId: string;
  totalDeclaredBytes: number;
}): Promise<CreatedSubmissionRecord | null> {
  return getDatabase().transaction(async (transaction) => {
    const now = new Date();
    const [availablePortal] = await transaction
      .select({ id: portals.id })
      .from(portals)
      .innerJoin(driveDestinations, eq(portals.destinationId, driveDestinations.id))
      .innerJoin(
        driveConnections,
        eq(driveDestinations.driveConnectionId, driveConnections.id),
      )
      .where(
        and(
          eq(portals.id, input.portalId),
          eq(portals.status, "OPEN"),
          gt(portals.expiresAt, now),
          eq(driveDestinations.status, "ACTIVE"),
          eq(driveConnections.status, "ACTIVE"),
        ),
      )
      .for("update", { of: portals })
      .limit(1);

    if (!availablePortal) {
      return null;
    }

    await transaction.insert(submissions).values({
      id: input.submissionId,
      portalId: input.portalId,
      guestName: input.guestName,
      fileCount: input.files.length,
      totalDeclaredBytes: input.totalDeclaredBytes,
      status: "CREATED",
    });

    await transaction.insert(uploadFiles).values(
      input.files.map((file) => ({
        id: file.id,
        submissionId: input.submissionId,
        clientFileId: file.clientFileId,
        originalName: file.originalName,
        destinationName: file.destinationName,
        declaredMimeType: file.declaredMimeType,
        declaredSizeBytes: file.declaredSizeBytes,
        state: "CREATED" as const,
      })),
    );

    await transaction.insert(auditEvents).values({
      id: newId("audit"),
      actorType: "GUEST",
      actorId: input.submissionId,
      eventType: "submission.created",
      resourceType: "submission",
      resourceId: input.submissionId,
      metadata: {
        fileCount: input.files.length,
        totalDeclaredBytes: input.totalDeclaredBytes,
      },
    });

    return {
      submissionId: input.submissionId,
      fileIds: input.files.map((file) => ({
        clientFileId: file.clientFileId,
        fileId: file.id,
      })),
    };
  });
}
