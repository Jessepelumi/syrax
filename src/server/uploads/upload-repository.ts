import "server-only";

import { and, eq, isNotNull, sql } from "drizzle-orm";

import { getDatabase } from "@/db/client";
import {
  auditEvents,
  driveConnections,
  driveDestinations,
  portals,
  submissions,
  type UploadFile,
  uploadFiles,
} from "@/db/schema";
import { newId } from "@/lib/ids";
import {
  deriveSubmissionStatus,
  isTerminalUploadState,
  type UploadFileState,
} from "@/server/uploads/upload-state";

type DatabaseTransaction = Parameters<
  Parameters<ReturnType<typeof getDatabase>["transaction"]>[0]
>[0];

export interface UploadFileContext {
  adminId: string;
  attemptCount: number;
  bytesConfirmed: number;
  clientFileId: string;
  connectionStatus: "ACTIVE" | "REVOKED" | "ERROR";
  declaredMimeType: string;
  declaredSizeBytes: number;
  destinationFolderId: string;
  destinationName: string;
  destinationStatus: "ACTIVE" | "INVALID" | "DISCONNECTED";
  encryptedProviderSessionRef: string | null;
  fileId: string;
  originalName: string;
  portalExpiresAt: Date;
  portalId: string;
  portalStatus: "DRAFT" | "OPEN" | "CLOSED" | "EXPIRED";
  providerFileId: string | null;
  providerSessionExpiresAt: Date | null;
  sessionCreationLease: string | null;
  sessionCreationLeaseExpiresAt: Date | null;
  state: UploadFileState;
  submissionId: string;
  version: number;
}

const uploadFileContextSelection = {
  adminId: driveConnections.adminId,
  attemptCount: uploadFiles.attemptCount,
  bytesConfirmed: uploadFiles.bytesConfirmed,
  clientFileId: uploadFiles.clientFileId,
  connectionStatus: driveConnections.status,
  declaredMimeType: uploadFiles.declaredMimeType,
  declaredSizeBytes: uploadFiles.declaredSizeBytes,
  destinationFolderId: driveDestinations.providerFolderId,
  destinationName: uploadFiles.destinationName,
  destinationStatus: driveDestinations.status,
  encryptedProviderSessionRef: uploadFiles.encryptedProviderSessionRef,
  fileId: uploadFiles.id,
  originalName: uploadFiles.originalName,
  portalExpiresAt: portals.expiresAt,
  portalId: portals.id,
  portalStatus: portals.status,
  providerFileId: uploadFiles.providerFileId,
  providerSessionExpiresAt: uploadFiles.providerSessionExpiresAt,
  sessionCreationLease: uploadFiles.sessionCreationLease,
  sessionCreationLeaseExpiresAt: uploadFiles.sessionCreationLeaseExpiresAt,
  state: uploadFiles.state,
  submissionId: submissions.id,
  version: uploadFiles.version,
};

async function updateSubmissionAggregate(
  transaction: DatabaseTransaction,
  submissionId: string,
  now: Date,
): Promise<void> {
  const [current] = await transaction
    .select({
      completedFiles: submissions.completedFiles,
      status: submissions.status,
    })
    .from(submissions)
    .where(eq(submissions.id, submissionId))
    .for("update")
    .limit(1);

  if (!current) {
    throw new Error("Submission disappeared during upload transition");
  }

  const fileRows = await transaction
    .select({ state: uploadFiles.state })
    .from(uploadFiles)
    .where(eq(uploadFiles.submissionId, submissionId));
  const states = fileRows.map((file) => file.state);
  const status = deriveSubmissionStatus(states);
  const completedFiles = states.filter((state) => state === "COMPLETED").length;

  if (current.status === status && current.completedFiles === completedFiles) {
    return;
  }

  const terminal = status === "COMPLETED" || status === "PARTIAL" || status === "FAILED";

  await transaction
    .update(submissions)
    .set({
      completedAt: terminal ? now : null,
      completedFiles,
      status,
      updatedAt: now,
      version: sql`${submissions.version} + 1`,
    })
    .where(eq(submissions.id, submissionId));

  if (current.status !== status) {
    await transaction.insert(auditEvents).values({
      id: newId("audit"),
      actorType: "SYSTEM",
      eventType: "submission.status_changed",
      resourceType: "submission",
      resourceId: submissionId,
      metadata: { from: current.status, to: status },
    });
  }
}

async function writeFileTransitionAudit(
  transaction: DatabaseTransaction,
  input: {
    fileId: string;
    from: UploadFileState;
    metadata?: Record<string, unknown>;
    to: UploadFileState;
  },
): Promise<void> {
  await transaction.insert(auditEvents).values({
    id: newId("audit"),
    actorType: "SYSTEM",
    eventType: "upload.state_changed",
    resourceType: "upload_file",
    resourceId: input.fileId,
    metadata: { from: input.from, to: input.to, ...input.metadata },
  });
}

function contextQuery(
  transaction: DatabaseTransaction | ReturnType<typeof getDatabase>,
  input: {
    clientFileId: string;
    fileId: string;
    portalId: string;
    submissionId: string;
  },
) {
  return transaction
    .select(uploadFileContextSelection)
    .from(uploadFiles)
    .innerJoin(submissions, eq(uploadFiles.submissionId, submissions.id))
    .innerJoin(portals, eq(submissions.portalId, portals.id))
    .innerJoin(driveDestinations, eq(portals.destinationId, driveDestinations.id))
    .innerJoin(
      driveConnections,
      eq(driveDestinations.driveConnectionId, driveConnections.id),
    )
    .where(
      and(
        eq(portals.id, input.portalId),
        eq(submissions.id, input.submissionId),
        eq(uploadFiles.id, input.fileId),
        eq(uploadFiles.clientFileId, input.clientFileId),
      ),
    );
}

export async function getUploadFileContext(input: {
  clientFileId: string;
  fileId: string;
  portalId: string;
  submissionId: string;
}): Promise<UploadFileContext | undefined> {
  const [context] = await contextQuery(getDatabase(), input).limit(1);

  return context;
}

export type ClaimUploadSessionResult =
  | { context: UploadFileContext; kind: "claimed" }
  | { context: UploadFileContext; kind: "existing" }
  | { kind: "busy" }
  | { kind: "not_found" }
  | { kind: "portal_unavailable" }
  | { kind: "session_expired" }
  | { kind: "state_conflict" };

export async function claimUploadSessionCreation(input: {
  clientFileId: string;
  fileId: string;
  lease: string;
  leaseExpiresAt: Date;
  portalId: string;
  submissionId: string;
}): Promise<ClaimUploadSessionResult> {
  return getDatabase().transaction(async (transaction) => {
    const now = new Date();
    const [context] = await contextQuery(transaction, input)
      .for("update", { of: uploadFiles })
      .limit(1);

    if (!context) {
      return { kind: "not_found" };
    }

    if (
      context.portalStatus !== "OPEN" ||
      context.portalExpiresAt.getTime() <= now.getTime() ||
      context.connectionStatus !== "ACTIVE" ||
      context.destinationStatus !== "ACTIVE"
    ) {
      return { kind: "portal_unavailable" };
    }

    if (context.state === "COMPLETED") {
      return { context, kind: "existing" };
    }

    if (context.encryptedProviderSessionRef) {
      if (
        !context.providerSessionExpiresAt ||
        context.providerSessionExpiresAt.getTime() <= now.getTime()
      ) {
        const from = context.state;

        if (!isTerminalUploadState(from)) {
          await transaction
            .update(uploadFiles)
            .set({
              encryptedProviderSessionRef: null,
              lastErrorCode: "UPLOAD_SESSION_EXPIRED",
              providerSessionExpiresAt: null,
              sessionCreationLease: null,
              sessionCreationLeaseExpiresAt: null,
              state: "EXPIRED",
              updatedAt: now,
              version: sql`${uploadFiles.version} + 1`,
            })
            .where(eq(uploadFiles.id, context.fileId));
          await writeFileTransitionAudit(transaction, {
            fileId: context.fileId,
            from,
            to: "EXPIRED",
          });
          await updateSubmissionAggregate(transaction, context.submissionId, now);
        }

        return { kind: "session_expired" };
      }

      return { context, kind: "existing" };
    }

    if (context.state !== "CREATED") {
      return { kind: "state_conflict" };
    }

    if (
      context.sessionCreationLease &&
      context.sessionCreationLeaseExpiresAt &&
      context.sessionCreationLeaseExpiresAt.getTime() > now.getTime()
    ) {
      return { kind: "busy" };
    }

    const [claimed] = await transaction
      .update(uploadFiles)
      .set({
        attemptCount: sql`${uploadFiles.attemptCount} + 1`,
        lastErrorCode: null,
        sessionCreationLease: input.lease,
        sessionCreationLeaseExpiresAt: input.leaseExpiresAt,
        updatedAt: now,
        version: sql`${uploadFiles.version} + 1`,
      })
      .where(and(eq(uploadFiles.id, context.fileId), eq(uploadFiles.version, context.version)))
      .returning({
        attemptCount: uploadFiles.attemptCount,
        version: uploadFiles.version,
      });

    if (!claimed) {
      return { kind: "busy" };
    }

    await transaction.insert(auditEvents).values({
      id: newId("audit"),
      actorType: "SYSTEM",
      eventType: "upload.session_creation_claimed",
      resourceType: "upload_file",
      resourceId: context.fileId,
      metadata: { attemptCount: claimed.attemptCount },
    });

    return {
      kind: "claimed",
      context: {
        ...context,
        attemptCount: claimed.attemptCount,
        sessionCreationLease: input.lease,
        sessionCreationLeaseExpiresAt: input.leaseExpiresAt,
        version: claimed.version,
      },
    };
  });
}

export async function finalizeUploadSessionCreation(input: {
  encryptedProviderSessionRef: string;
  fileId: string;
  lease: string;
  providerSessionExpiresAt: Date;
}): Promise<UploadFile | undefined> {
  return getDatabase().transaction(async (transaction) => {
    const now = new Date();
    const [updated] = await transaction
      .update(uploadFiles)
      .set({
        encryptedProviderSessionRef: input.encryptedProviderSessionRef,
        providerSessionExpiresAt: input.providerSessionExpiresAt,
        sessionCreationLease: null,
        sessionCreationLeaseExpiresAt: null,
        state: "SESSION_READY",
        updatedAt: now,
        version: sql`${uploadFiles.version} + 1`,
      })
      .where(
        and(
          eq(uploadFiles.id, input.fileId),
          eq(uploadFiles.state, "CREATED"),
          eq(uploadFiles.sessionCreationLease, input.lease),
        ),
      )
      .returning();

    if (!updated) {
      return undefined;
    }

    await writeFileTransitionAudit(transaction, {
      fileId: updated.id,
      from: "CREATED",
      to: "SESSION_READY",
      metadata: { attemptCount: updated.attemptCount },
    });
    await updateSubmissionAggregate(transaction, updated.submissionId, now);

    return updated;
  });
}

export async function releaseUploadSessionCreationLease(input: {
  errorCode: string;
  fileId: string;
  lease: string;
}): Promise<void> {
  await getDatabase().transaction(async (transaction) => {
    const [released] = await transaction
      .update(uploadFiles)
      .set({
        lastErrorCode: input.errorCode,
        sessionCreationLease: null,
        sessionCreationLeaseExpiresAt: null,
        updatedAt: new Date(),
        version: sql`${uploadFiles.version} + 1`,
      })
      .where(
        and(
          eq(uploadFiles.id, input.fileId),
          eq(uploadFiles.sessionCreationLease, input.lease),
        ),
      )
      .returning({ attemptCount: uploadFiles.attemptCount, id: uploadFiles.id });

    if (released) {
      await transaction.insert(auditEvents).values({
        id: newId("audit"),
        actorType: "SYSTEM",
        eventType: "upload.session_creation_failed",
        resourceType: "upload_file",
        resourceId: released.id,
        metadata: {
          attemptCount: released.attemptCount,
          code: input.errorCode,
        },
      });
    }
  });
}

export async function prepareUploadFileVerification(input: {
  fileId: string;
  submissionId: string;
}): Promise<UploadFile | undefined> {
  return getDatabase().transaction(async (transaction) => {
    const [current] = await transaction
      .select()
      .from(uploadFiles)
      .where(
        and(
          eq(uploadFiles.id, input.fileId),
          eq(uploadFiles.submissionId, input.submissionId),
        ),
      )
      .for("update")
      .limit(1);

    if (!current || isTerminalUploadState(current.state)) {
      return current;
    }

    let state = current.state;
    let updated = current;
    const now = new Date();

    if (state === "SESSION_READY" || state === "RETRY_WAIT") {
      [updated] = await transaction
        .update(uploadFiles)
        .set({
          state: "UPLOADING",
          updatedAt: now,
          version: sql`${uploadFiles.version} + 1`,
        })
        .where(eq(uploadFiles.id, current.id))
        .returning();
      await writeFileTransitionAudit(transaction, {
        fileId: current.id,
        from: state,
        to: "UPLOADING",
      });
      state = "UPLOADING";
    }

    if (state === "UPLOADING") {
      [updated] = await transaction
        .update(uploadFiles)
        .set({
          state: "VERIFYING",
          updatedAt: now,
          version: sql`${uploadFiles.version} + 1`,
        })
        .where(eq(uploadFiles.id, current.id))
        .returning();
      await writeFileTransitionAudit(transaction, {
        fileId: current.id,
        from: "UPLOADING",
        to: "VERIFYING",
      });
      state = "VERIFYING";
    }

    if (state !== "VERIFYING") {
      return undefined;
    }

    await updateSubmissionAggregate(transaction, current.submissionId, now);
    return updated;
  });
}

export async function reconcileUploadFileProgress(input: {
  confirmedBytes: number;
  fileId: string;
  submissionId: string;
}): Promise<UploadFile | undefined> {
  return getDatabase().transaction(async (transaction) => {
    const [current] = await transaction
      .select()
      .from(uploadFiles)
      .where(
        and(
          eq(uploadFiles.id, input.fileId),
          eq(uploadFiles.submissionId, input.submissionId),
          isNotNull(uploadFiles.encryptedProviderSessionRef),
        ),
      )
      .for("update")
      .limit(1);

    if (!current || isTerminalUploadState(current.state)) {
      return current;
    }

    if (
      input.confirmedBytes < current.bytesConfirmed ||
      input.confirmedBytes > current.declaredSizeBytes
    ) {
      return undefined;
    }

    const now = new Date();
    const nextState =
      current.state === "SESSION_READY" || current.state === "RETRY_WAIT"
        ? "UPLOADING"
        : current.state;
    const [updated] = await transaction
      .update(uploadFiles)
      .set({
        bytesConfirmed: input.confirmedBytes,
        lastErrorCode: null,
        state: nextState,
        updatedAt: now,
        version: sql`${uploadFiles.version} + 1`,
      })
      .where(eq(uploadFiles.id, current.id))
      .returning();

    if (nextState !== current.state) {
      await writeFileTransitionAudit(transaction, {
        fileId: current.id,
        from: current.state,
        to: nextState,
      });
    }

    await updateSubmissionAggregate(transaction, current.submissionId, now);
    return updated;
  });
}

export async function completeUploadFile(input: {
  fileId: string;
  providerFileId: string;
  submissionId: string;
}): Promise<UploadFile | undefined> {
  return getDatabase().transaction(async (transaction) => {
    const [current] = await transaction
      .select()
      .from(uploadFiles)
      .where(
        and(
          eq(uploadFiles.id, input.fileId),
          eq(uploadFiles.submissionId, input.submissionId),
        ),
      )
      .for("update")
      .limit(1);

    if (!current) {
      return undefined;
    }

    if (current.state === "COMPLETED") {
      return current.providerFileId === input.providerFileId ? current : undefined;
    }

    if (current.state !== "VERIFYING") {
      return undefined;
    }

    const now = new Date();
    const [completed] = await transaction
      .update(uploadFiles)
      .set({
        bytesConfirmed: current.declaredSizeBytes,
        completedAt: now,
        encryptedProviderSessionRef: null,
        lastErrorCode: null,
        providerFileId: input.providerFileId,
        providerSessionExpiresAt: null,
        sessionCreationLease: null,
        sessionCreationLeaseExpiresAt: null,
        state: "COMPLETED",
        updatedAt: now,
        version: sql`${uploadFiles.version} + 1`,
      })
      .where(eq(uploadFiles.id, current.id))
      .returning();

    await writeFileTransitionAudit(transaction, {
      fileId: current.id,
      from: "VERIFYING",
      to: "COMPLETED",
      metadata: { confirmedBytes: current.declaredSizeBytes },
    });
    await updateSubmissionAggregate(transaction, current.submissionId, now);

    return completed;
  });
}

export async function expireUploadFileSession(input: {
  fileId: string;
  submissionId: string;
}): Promise<UploadFile | undefined> {
  return getDatabase().transaction(async (transaction) => {
    const [current] = await transaction
      .select()
      .from(uploadFiles)
      .where(
        and(
          eq(uploadFiles.id, input.fileId),
          eq(uploadFiles.submissionId, input.submissionId),
        ),
      )
      .for("update")
      .limit(1);

    if (!current || isTerminalUploadState(current.state)) {
      return current;
    }

    const now = new Date();
    const [expired] = await transaction
      .update(uploadFiles)
      .set({
        encryptedProviderSessionRef: null,
        lastErrorCode: "UPLOAD_SESSION_EXPIRED",
        providerSessionExpiresAt: null,
        sessionCreationLease: null,
        sessionCreationLeaseExpiresAt: null,
        state: "EXPIRED",
        updatedAt: now,
        version: sql`${uploadFiles.version} + 1`,
      })
      .where(eq(uploadFiles.id, current.id))
      .returning();

    await writeFileTransitionAudit(transaction, {
      fileId: current.id,
      from: current.state,
      to: "EXPIRED",
    });
    await updateSubmissionAggregate(transaction, current.submissionId, now);

    return expired;
  });
}

export async function markUploadFileRetryWait(input: {
  errorCode: string;
  fileId: string;
  submissionId: string;
}): Promise<UploadFile | undefined> {
  return getDatabase().transaction(async (transaction) => {
    const [current] = await transaction
      .select()
      .from(uploadFiles)
      .where(
        and(
          eq(uploadFiles.id, input.fileId),
          eq(uploadFiles.submissionId, input.submissionId),
        ),
      )
      .for("update")
      .limit(1);

    if (!current || current.state !== "UPLOADING") {
      return current;
    }

    const now = new Date();
    const [updated] = await transaction
      .update(uploadFiles)
      .set({
        lastErrorCode: input.errorCode,
        state: "RETRY_WAIT",
        updatedAt: now,
        version: sql`${uploadFiles.version} + 1`,
      })
      .where(eq(uploadFiles.id, current.id))
      .returning();

    await writeFileTransitionAudit(transaction, {
      fileId: current.id,
      from: "UPLOADING",
      to: "RETRY_WAIT",
      metadata: { code: input.errorCode },
    });
    await updateSubmissionAggregate(transaction, current.submissionId, now);

    return updated;
  });
}

export async function failUploadFile(input: {
  errorCode: string;
  fileId: string;
  submissionId: string;
}): Promise<UploadFile | undefined> {
  return getDatabase().transaction(async (transaction) => {
    const [current] = await transaction
      .select()
      .from(uploadFiles)
      .where(
        and(
          eq(uploadFiles.id, input.fileId),
          eq(uploadFiles.submissionId, input.submissionId),
        ),
      )
      .for("update")
      .limit(1);

    if (!current || isTerminalUploadState(current.state)) {
      return current;
    }

    const now = new Date();
    const [failed] = await transaction
      .update(uploadFiles)
      .set({
        encryptedProviderSessionRef: null,
        lastErrorCode: input.errorCode,
        providerSessionExpiresAt: null,
        sessionCreationLease: null,
        sessionCreationLeaseExpiresAt: null,
        state: "FAILED",
        updatedAt: now,
        version: sql`${uploadFiles.version} + 1`,
      })
      .where(eq(uploadFiles.id, current.id))
      .returning();

    await writeFileTransitionAudit(transaction, {
      fileId: current.id,
      from: current.state,
      to: "FAILED",
      metadata: { code: input.errorCode },
    });
    await updateSubmissionAggregate(transaction, current.submissionId, now);

    return failed;
  });
}

export async function cancelUploadFile(input: {
  fileId: string;
  submissionId: string;
}): Promise<UploadFile | undefined> {
  return getDatabase().transaction(async (transaction) => {
    const [current] = await transaction
      .select()
      .from(uploadFiles)
      .where(
        and(
          eq(uploadFiles.id, input.fileId),
          eq(uploadFiles.submissionId, input.submissionId),
        ),
      )
      .for("update")
      .limit(1);

    if (!current || isTerminalUploadState(current.state)) {
      return current;
    }

    if (current.state === "VERIFYING") {
      return undefined;
    }

    const now = new Date();
    const [cancelled] = await transaction
      .update(uploadFiles)
      .set({
        encryptedProviderSessionRef: null,
        lastErrorCode: "UPLOAD_CANCELLED",
        providerSessionExpiresAt: null,
        sessionCreationLease: null,
        sessionCreationLeaseExpiresAt: null,
        state: "CANCELLED",
        updatedAt: now,
        version: sql`${uploadFiles.version} + 1`,
      })
      .where(eq(uploadFiles.id, current.id))
      .returning();

    await writeFileTransitionAudit(transaction, {
      fileId: current.id,
      from: current.state,
      to: "CANCELLED",
    });
    await updateSubmissionAggregate(transaction, current.submissionId, now);

    return cancelled;
  });
}
