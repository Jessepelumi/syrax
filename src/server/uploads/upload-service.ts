import "server-only";

import { getEnvironment } from "@/lib/env";
import { newId } from "@/lib/ids";
import {
  isAllowedUploadMimeType,
  type AllowedUploadMimeType,
} from "@/lib/mime";
import {
  createDriveUploadSession,
  DurableUploadProviderError,
  type DriveUploadFileMetadata,
  queryDriveUploadSession,
  verifyDriveUploadCompletion,
} from "@/server/drive/durable-upload";
import {
  assertPortalAcceptsSubmissions,
  PortalServiceError,
  resolvePublicPortal,
} from "@/server/portals/portal-service";
import {
  claimUploadSessionCreation,
  cancelUploadFile,
  completeUploadFile,
  expireUploadFileSession,
  failUploadFile,
  finalizeUploadSessionCreation,
  getUploadFileContext,
  markUploadFileRetryWait,
  prepareUploadFileVerification,
  reconcileUploadFileProgress,
  releaseUploadSessionCreationLease,
  type UploadFileContext,
} from "@/server/uploads/upload-repository";
import { isSafeGoogleUploadSessionUrl } from "@/server/drive/resumable-upload";
import { createUploadSessionVault } from "@/server/uploads/session-vault";
import { isTerminalUploadState } from "@/server/uploads/upload-state";

const SESSION_CREATION_LEASE_MILLISECONDS = 2 * 60 * 1000;
const MAX_SESSION_CREATION_ATTEMPTS = 5;

export type UploadServiceErrorCode =
  | "DESTINATION_UNAVAILABLE"
  | "FILE_NOT_FOUND"
  | "PROVIDER_RATE_LIMITED"
  | "PROVIDER_TRANSIENT_ERROR"
  | "UPLOAD_SESSION_BUSY"
  | "UPLOAD_SESSION_EXPIRED"
  | "UPLOAD_STATE_CONFLICT"
  | "UPLOAD_VERIFICATION_FAILED";

export class UploadServiceError extends Error {
  constructor(
    readonly code: UploadServiceErrorCode,
    readonly providerStatus?: number,
  ) {
    super(code);
    this.name = "UploadServiceError";
  }
}

export interface UploadFileIdentity {
  clientFileId: string;
  fileId: string;
  portalToken: string;
  submissionId: string;
}

export interface UploadSessionDescriptor {
  bytesConfirmed: number;
  chunkSizeBytes: number;
  expiresAt?: string;
  fileId: string;
  state: UploadFileContext["state"];
  uploadUrl?: string;
}

export interface UploadProgressResult {
  bytesConfirmed: number;
  fileId: string;
  state: UploadFileContext["state"];
}

type ResolvedUploadFileContext = Omit<
  UploadFileContext,
  "declaredMimeType"
> & { declaredMimeType: AllowedUploadMimeType };

function providerServiceError(error: DurableUploadProviderError): UploadServiceError {
  switch (error.code) {
    case "PROVIDER_RATE_LIMITED":
      return new UploadServiceError("PROVIDER_RATE_LIMITED", error.providerStatus);
    case "PROVIDER_TRANSIENT_ERROR":
      return new UploadServiceError("PROVIDER_TRANSIENT_ERROR", error.providerStatus);
    case "UPLOAD_SESSION_EXPIRED":
      return new UploadServiceError("UPLOAD_SESSION_EXPIRED", error.providerStatus);
    default:
      return new UploadServiceError("UPLOAD_VERIFICATION_FAILED", error.providerStatus);
  }
}

function getSessionVault() {
  return createUploadSessionVault(getEnvironment().TOKEN_ENCRYPTION_KEY);
}

function decryptSession(context: UploadFileContext): string {
  if (!context.encryptedProviderSessionRef) {
    throw new UploadServiceError("UPLOAD_STATE_CONFLICT");
  }

  try {
    const uploadUrl = getSessionVault().decrypt(
      context.encryptedProviderSessionRef,
    );

    if (!isSafeGoogleUploadSessionUrl(uploadUrl)) {
      throw new Error("Unsafe provider session URI");
    }

    return uploadUrl;
  } catch {
    throw new UploadServiceError("UPLOAD_VERIFICATION_FAILED");
  }
}

async function resolveFileContext(
  input: UploadFileIdentity,
  requireOpenPortal: boolean,
): Promise<ResolvedUploadFileContext> {
  const portal = await resolvePublicPortal(input.portalToken);

  if (!portal) {
    throw new PortalServiceError("PORTAL_NOT_FOUND");
  }

  if (requireOpenPortal) {
    assertPortalAcceptsSubmissions(portal);
  }

  const context = await getUploadFileContext({
    portalId: portal.id,
    submissionId: input.submissionId,
    fileId: input.fileId,
    clientFileId: input.clientFileId,
  });

  if (!context) {
    throw new UploadServiceError("FILE_NOT_FOUND");
  }

  if (
    context.connectionStatus !== "ACTIVE" ||
    context.destinationStatus !== "ACTIVE"
  ) {
    throw new UploadServiceError("DESTINATION_UNAVAILABLE");
  }

  if (!isAllowedUploadMimeType(context.declaredMimeType)) {
    throw new UploadServiceError("UPLOAD_VERIFICATION_FAILED");
  }

  return {
    ...context,
    declaredMimeType: context.declaredMimeType,
  };
}

function existingSessionDescriptor(
  context: UploadFileContext,
): UploadSessionDescriptor {
  if (context.state === "COMPLETED") {
    return {
      bytesConfirmed: context.declaredSizeBytes,
      chunkSizeBytes: getEnvironment().UPLOAD_CHUNK_SIZE_BYTES,
      fileId: context.fileId,
      state: context.state,
    };
  }

  const uploadUrl = decryptSession(context);

  return {
    bytesConfirmed: context.bytesConfirmed,
    chunkSizeBytes: getEnvironment().UPLOAD_CHUNK_SIZE_BYTES,
    expiresAt: context.providerSessionExpiresAt?.toISOString(),
    fileId: context.fileId,
    state: context.state,
    uploadUrl,
  };
}

export async function createOrGetUploadSession(
  input: UploadFileIdentity,
): Promise<UploadSessionDescriptor> {
  const resolvedContext = await resolveFileContext(input, true);

  const lease = newId("lease");
  const leaseExpiresAt = new Date(
    Date.now() + SESSION_CREATION_LEASE_MILLISECONDS,
  );

  const claim = await claimUploadSessionCreation({
    portalId: resolvedContext.portalId,
    submissionId: input.submissionId,
    fileId: input.fileId,
    clientFileId: input.clientFileId,
    lease,
    leaseExpiresAt,
  });

  switch (claim.kind) {
    case "existing":
      return existingSessionDescriptor(claim.context);
    case "busy":
      throw new UploadServiceError("UPLOAD_SESSION_BUSY");
    case "not_found":
      throw new UploadServiceError("FILE_NOT_FOUND");
    case "portal_unavailable":
      throw new PortalServiceError("PORTAL_STATE_CONFLICT");
    case "session_expired":
      throw new UploadServiceError("UPLOAD_SESSION_EXPIRED");
    case "state_conflict":
      throw new UploadServiceError("UPLOAD_STATE_CONFLICT");
  }

  const context: ResolvedUploadFileContext = {
    ...claim.context,
    declaredMimeType: resolvedContext.declaredMimeType,
  };

  if (context.attemptCount > MAX_SESSION_CREATION_ATTEMPTS) {
    await failUploadFile({
      fileId: context.fileId,
      submissionId: context.submissionId,
      errorCode: "UPLOAD_SESSION_ATTEMPTS_EXHAUSTED",
    });
    throw new UploadServiceError("UPLOAD_VERIFICATION_FAILED");
  }

  try {
    const providerSession = await createDriveUploadSession({
      adminId: context.adminId,
      destinationFolderId: context.destinationFolderId,
      destinationName: context.destinationName,
      declaredMimeType: context.declaredMimeType,
      declaredSizeBytes: context.declaredSizeBytes,
      fileId: context.fileId,
      submissionId: context.submissionId,
    });
    const encryptedProviderSessionRef = getSessionVault().encrypt(
      providerSession.uploadUrl,
    );
    const finalized = await finalizeUploadSessionCreation({
      encryptedProviderSessionRef,
      fileId: context.fileId,
      lease,
      providerSessionExpiresAt: providerSession.expiresAt,
    });

    if (!finalized) {
      throw new UploadServiceError("UPLOAD_STATE_CONFLICT");
    }

    return {
      bytesConfirmed: finalized.bytesConfirmed,
      chunkSizeBytes: getEnvironment().UPLOAD_CHUNK_SIZE_BYTES,
      expiresAt: providerSession.expiresAt.toISOString(),
      fileId: finalized.id,
      state: finalized.state,
      uploadUrl: providerSession.uploadUrl,
    };
  } catch (error) {
    const code =
      error instanceof DurableUploadProviderError
        ? error.code
        : error instanceof UploadServiceError
          ? error.code
          : "PROVIDER_TRANSIENT_ERROR";

    await releaseUploadSessionCreationLease({
      errorCode: code,
      fileId: context.fileId,
      lease,
    });

    if (error instanceof UploadServiceError) {
      throw error;
    }

    if (error instanceof DurableUploadProviderError) {
      if (
        error.code === "PROVIDER_REJECTED" ||
        error.code === "UPLOAD_SESSION_INVALID"
      ) {
        await failUploadFile({
          fileId: context.fileId,
          submissionId: context.submissionId,
          errorCode: error.code,
        });
      }

      throw providerServiceError(error);
    }

    throw new UploadServiceError("PROVIDER_TRANSIENT_ERROR");
  }
}

async function verifyAndCompleteUpload(input: {
  context: ResolvedUploadFileContext;
  metadata?: DriveUploadFileMetadata;
  providerFileId?: string;
}): Promise<UploadProgressResult> {
  const prepared = await prepareUploadFileVerification({
    fileId: input.context.fileId,
    submissionId: input.context.submissionId,
  });

  if (!prepared) {
    throw new UploadServiceError("UPLOAD_STATE_CONFLICT");
  }

  if (prepared.state === "COMPLETED") {
    return {
      bytesConfirmed: prepared.bytesConfirmed,
      fileId: prepared.id,
      state: prepared.state,
    };
  }

  if (prepared.state !== "VERIFYING") {
    throw new UploadServiceError("UPLOAD_STATE_CONFLICT");
  }

  try {
    const verified = await verifyDriveUploadCompletion({
      adminId: input.context.adminId,
      destinationFolderId: input.context.destinationFolderId,
      destinationName: input.context.destinationName,
      declaredMimeType: input.context.declaredMimeType,
      declaredSizeBytes: input.context.declaredSizeBytes,
      fileId: input.context.fileId,
      submissionId: input.context.submissionId,
      metadata: input.metadata,
      providerFileId: input.providerFileId,
    });
    const completed = await completeUploadFile({
      fileId: input.context.fileId,
      submissionId: input.context.submissionId,
      providerFileId: verified.providerFileId,
    });

    if (!completed) {
      throw new UploadServiceError("UPLOAD_STATE_CONFLICT");
    }

    return {
      bytesConfirmed: completed.bytesConfirmed,
      fileId: completed.id,
      state: completed.state,
    };
  } catch (error) {
    if (error instanceof DurableUploadProviderError) {
      throw providerServiceError(error);
    }

    throw error;
  }
}

export async function reconcileUploadStatus(
  input: UploadFileIdentity,
): Promise<UploadProgressResult> {
  let context = await resolveFileContext(input, false);

  if (context.state === "COMPLETED") {
    return {
      bytesConfirmed: context.bytesConfirmed,
      fileId: context.fileId,
      state: context.state,
    };
  }

  if (isTerminalUploadState(context.state)) {
    throw new UploadServiceError(
      context.state === "EXPIRED"
        ? "UPLOAD_SESSION_EXPIRED"
        : "UPLOAD_STATE_CONFLICT",
    );
  }

  if (
    !context.providerSessionExpiresAt ||
    context.providerSessionExpiresAt.getTime() <= Date.now()
  ) {
    await expireUploadFileSession({
      fileId: context.fileId,
      submissionId: context.submissionId,
    });
    throw new UploadServiceError("UPLOAD_SESSION_EXPIRED");
  }

  const uploadUrl = decryptSession(context);
  const started = await reconcileUploadFileProgress({
    fileId: context.fileId,
    submissionId: context.submissionId,
    confirmedBytes: context.bytesConfirmed,
  });

  if (started) {
    context = {
      ...context,
      ...started,
      declaredMimeType: context.declaredMimeType,
      fileId: started.id,
    };
  }

  try {
    const providerStatus = await queryDriveUploadSession({
      uploadUrl,
      declaredSizeBytes: context.declaredSizeBytes,
    });

    if (providerStatus.kind === "complete") {
      return verifyAndCompleteUpload({
        context,
        metadata: providerStatus.metadata,
      });
    }

    const updated = await reconcileUploadFileProgress({
      fileId: context.fileId,
      submissionId: context.submissionId,
      confirmedBytes: providerStatus.confirmedBytes,
    });

    if (!updated) {
      throw new UploadServiceError("UPLOAD_VERIFICATION_FAILED");
    }

    return {
      bytesConfirmed: updated.bytesConfirmed,
      fileId: updated.id,
      state: updated.state,
    };
  } catch (error) {
    if (error instanceof DurableUploadProviderError) {
      if (
        error.code === "UPLOAD_SESSION_EXPIRED" ||
        error.code === "PROVIDER_REJECTED"
      ) {
        await expireUploadFileSession({
          fileId: context.fileId,
          submissionId: context.submissionId,
        });
        throw new UploadServiceError(
          "UPLOAD_SESSION_EXPIRED",
          error.providerStatus,
        );
      }

      if (
        error.code === "PROVIDER_RATE_LIMITED" ||
        error.code === "PROVIDER_TRANSIENT_ERROR"
      ) {
        await markUploadFileRetryWait({
          fileId: context.fileId,
          submissionId: context.submissionId,
          errorCode: error.code,
        });
      }

      throw providerServiceError(error);
    }

    throw error;
  }
}

export async function completeUpload(
  input: UploadFileIdentity & { providerFileId?: string },
): Promise<UploadProgressResult> {
  const context = await resolveFileContext(input, false);

  if (context.state === "COMPLETED") {
    return {
      bytesConfirmed: context.bytesConfirmed,
      fileId: context.fileId,
      state: context.state,
    };
  }

  return verifyAndCompleteUpload({
    context,
    providerFileId: input.providerFileId,
  });
}

export async function cancelUpload(
  input: UploadFileIdentity,
): Promise<UploadProgressResult> {
  const context = await resolveFileContext(input, false);
  const cancelled = await cancelUploadFile({
    fileId: context.fileId,
    submissionId: context.submissionId,
  });

  if (!cancelled) {
    throw new UploadServiceError("UPLOAD_STATE_CONFLICT");
  }

  return {
    bytesConfirmed: cancelled.bytesConfirmed,
    fileId: cancelled.id,
    state: cancelled.state,
  };
}
