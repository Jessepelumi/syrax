import "server-only";

import type { drive_v3 } from "googleapis";

import { getEnvironment } from "@/lib/env";
import { newId } from "@/lib/ids";
import { getAuthorizedGoogleClient, getDriveClient } from "@/server/drive/client";
import { getActiveDriveDestinationForAdmin } from "@/server/drive/destination-repository";
import { recordFeasibilityUploadEvent } from "@/server/drive/feasibility-upload-repository";

const DRIVE_RESUMABLE_CREATE_URL =
  "https://www.googleapis.com/upload/drive/v3/files";
const FEASIBILITY_PURPOSE = "feasibility";
const FEASIBILITY_MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024;

export const FEASIBILITY_IMAGE_TYPES = [
  "image/heic",
  "image/jpeg",
  "image/png",
] as const;
export const FEASIBILITY_UPLOAD_ID_PATTERN = /^spike_[a-z0-9]+$/;

export type FeasibilityImageType = (typeof FEASIBILITY_IMAGE_TYPES)[number];

const EXTENSION_BY_MIME_TYPE: Record<FeasibilityImageType, string> = {
  "image/heic": "heic",
  "image/jpeg": "jpg",
  "image/png": "png",
};

export type FeasibilityUploadErrorCode =
  | "DESTINATION_UNAVAILABLE"
  | "PROVIDER_RATE_LIMITED"
  | "PROVIDER_REJECTED"
  | "PROVIDER_TRANSIENT_ERROR"
  | "UPLOAD_SESSION_INVALID"
  | "UPLOAD_VERIFICATION_FAILED";

export class FeasibilityUploadError extends Error {
  constructor(
    readonly code: FeasibilityUploadErrorCode,
    readonly providerStatus?: number,
  ) {
    super(code);
    this.name = "FeasibilityUploadError";
  }
}

interface DriveFileMetadata {
  appProperties?: Record<string, string> | null;
  id?: string | null;
  mimeType?: string | null;
  name?: string | null;
  parents?: string[] | null;
  size?: string | null;
  trashed?: boolean | null;
}

function isFeasibilityImageType(value: string): value is FeasibilityImageType {
  return FEASIBILITY_IMAGE_TYPES.some((mimeType) => mimeType === value);
}

export function createFeasibilityDestinationName(
  uploadId: string,
  mimeType: FeasibilityImageType,
): string {
  return `syrax-feasibility-${uploadId}.${EXTENSION_BY_MIME_TYPE[mimeType]}`;
}

export function isSafeGoogleUploadSessionUrl(value: string): boolean {
  try {
    const url = new URL(value);

    return (
      url.protocol === "https:" &&
      url.hostname === "www.googleapis.com" &&
      url.pathname === "/upload/drive/v3/files" &&
      url.searchParams.get("uploadType") === "resumable" &&
      Boolean(url.searchParams.get("upload_id"))
    );
  } catch {
    return false;
  }
}

function providerErrorCode(status: number): FeasibilityUploadErrorCode {
  if (status === 429) {
    return "PROVIDER_RATE_LIMITED";
  }

  if (status >= 500) {
    return "PROVIDER_TRANSIENT_ERROR";
  }

  return "PROVIDER_REJECTED";
}

export function validateFeasibilityUploadMetadata(input: {
  destinationFolderId: string;
  metadata: DriveFileMetadata;
  uploadId: string;
}): {
  destinationName: string;
  mimeType: FeasibilityImageType;
  providerFileId: string;
  sizeBytes: number;
} {
  const { metadata } = input;
  const declaredMimeType = metadata.appProperties?.syraxDeclaredMimeType;
  const declaredSize = metadata.appProperties?.syraxDeclaredSizeBytes;

  if (
    !metadata.id ||
    metadata.trashed === true ||
    !metadata.parents?.includes(input.destinationFolderId) ||
    metadata.appProperties?.syraxPurpose !== FEASIBILITY_PURPOSE ||
    metadata.appProperties?.syraxUploadId !== input.uploadId ||
    !declaredMimeType ||
    !isFeasibilityImageType(declaredMimeType) ||
    metadata.mimeType !== declaredMimeType ||
    !declaredSize ||
    metadata.size !== declaredSize ||
    !/^\d+$/.test(declaredSize)
  ) {
    throw new FeasibilityUploadError("UPLOAD_VERIFICATION_FAILED");
  }

  const destinationName = createFeasibilityDestinationName(
    input.uploadId,
    declaredMimeType,
  );

  if (metadata.name !== destinationName) {
    throw new FeasibilityUploadError("UPLOAD_VERIFICATION_FAILED");
  }

  const sizeBytes = Number(declaredSize);

  if (!Number.isSafeInteger(sizeBytes) || sizeBytes <= 0) {
    throw new FeasibilityUploadError("UPLOAD_VERIFICATION_FAILED");
  }

  return {
    destinationName,
    mimeType: declaredMimeType,
    providerFileId: metadata.id,
    sizeBytes,
  };
}

function escapeDriveQueryLiteral(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("'", "\\'");
}

async function findFeasibilityUploadMetadata(input: {
  destinationFolderId: string;
  drive: drive_v3.Drive;
  uploadId: string;
}): Promise<DriveFileMetadata> {
  const folderId = escapeDriveQueryLiteral(input.destinationFolderId);
  const uploadId = escapeDriveQueryLiteral(input.uploadId);
  const query = `'${folderId}' in parents and appProperties has { key='syraxUploadId' and value='${uploadId}' } and trashed = false`;
  const retryDelayMilliseconds = [250, 750];

  for (let attempt = 0; attempt <= retryDelayMilliseconds.length; attempt += 1) {
    const response = await input.drive.files.list({
      fields: "files(id,name,mimeType,size,parents,trashed,appProperties)",
      pageSize: 2,
      q: query,
      spaces: "drive",
    });
    const matches = response.data.files ?? [];

    if (matches.length === 1) {
      return matches[0];
    }

    if (matches.length > 1) {
      throw new FeasibilityUploadError("UPLOAD_VERIFICATION_FAILED");
    }

    const delay = retryDelayMilliseconds[attempt];

    if (delay) {
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw new FeasibilityUploadError("UPLOAD_VERIFICATION_FAILED");
}

export async function createFeasibilityUploadSession(input: {
  adminId: string;
  mimeType: FeasibilityImageType;
  sizeBytes: number;
}): Promise<{
  uploadId: string;
  uploadUrl: string;
}> {
  const destination = await getActiveDriveDestinationForAdmin(input.adminId);

  if (!destination) {
    throw new FeasibilityUploadError("DESTINATION_UNAVAILABLE");
  }

  const authorization = await getAuthorizedGoogleClient(input.adminId);
  const uploadId = newId("spike");
  const destinationName = createFeasibilityDestinationName(uploadId, input.mimeType);
  const createUrl = new URL(DRIVE_RESUMABLE_CREATE_URL);
  createUrl.searchParams.set("uploadType", "resumable");
  createUrl.searchParams.set("supportsAllDrives", "true");
  createUrl.searchParams.set(
    "fields",
    "id,name,mimeType,size,parents,trashed,appProperties",
  );

  const response = await fetch(createUrl, {
    body: JSON.stringify({
      appProperties: {
        syraxDeclaredMimeType: input.mimeType,
        syraxDeclaredSizeBytes: String(input.sizeBytes),
        syraxPurpose: FEASIBILITY_PURPOSE,
        syraxUploadId: uploadId,
      },
      mimeType: input.mimeType,
      name: destinationName,
      parents: [destination.providerFolderId],
    }),
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${authorization.accessToken}`,
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Length": String(input.sizeBytes),
      "X-Upload-Content-Type": input.mimeType,
    },
    method: "POST",
  });

  if (!response.ok) {
    throw new FeasibilityUploadError(
      providerErrorCode(response.status),
      response.status,
    );
  }

  const uploadUrl = response.headers.get("location");

  if (!uploadUrl || !isSafeGoogleUploadSessionUrl(uploadUrl)) {
    throw new FeasibilityUploadError("UPLOAD_SESSION_INVALID");
  }

  await recordFeasibilityUploadEvent({
    adminId: input.adminId,
    eventType: "drive.feasibility_upload.session_created",
    metadata: {
      declaredBytes: input.sizeBytes,
      declaredMimeType: input.mimeType,
      provider: "google_drive",
    },
    uploadId,
  });

  return { uploadId, uploadUrl };
}

export async function verifyFeasibilityUpload(input: {
  adminId: string;
  providerFileId?: string;
  uploadId: string;
}) {
  const destination = await getActiveDriveDestinationForAdmin(input.adminId);

  if (!destination) {
    throw new FeasibilityUploadError("DESTINATION_UNAVAILABLE");
  }

  const { drive } = await getDriveClient(input.adminId);
  const metadata = input.providerFileId
    ? (
        await drive.files.get({
          fileId: input.providerFileId,
          fields: "id,name,mimeType,size,parents,trashed,appProperties",
          supportsAllDrives: true,
        })
      ).data
    : await findFeasibilityUploadMetadata({
        destinationFolderId: destination.providerFolderId,
        drive,
        uploadId: input.uploadId,
      });
  const verified = validateFeasibilityUploadMetadata({
    destinationFolderId: destination.providerFolderId,
    metadata,
    uploadId: input.uploadId,
  });

  await recordFeasibilityUploadEvent({
    adminId: input.adminId,
    eventType: "drive.feasibility_upload.completed",
    metadata: {
      confirmedBytes: verified.sizeBytes,
      mimeType: verified.mimeType,
      provider: "google_drive",
    },
    uploadId: input.uploadId,
  });

  return verified;
}

export async function recordFeasibilityUploadFailure(input: {
  adminId: string;
  code: string;
  providerStatus?: number;
  stage: string;
  uploadId: string;
}): Promise<void> {
  await recordFeasibilityUploadEvent({
    adminId: input.adminId,
    eventType: "drive.feasibility_upload.failed",
    metadata: {
      code: input.code,
      provider: "google_drive",
      providerStatus: input.providerStatus,
      stage: input.stage,
    },
    uploadId: input.uploadId,
  });
}

export function getFeasibilityUploadLimitBytes(): number {
  return Math.min(
    getEnvironment().MAX_FILE_SIZE_BYTES,
    FEASIBILITY_MAX_FILE_SIZE_BYTES,
  );
}
