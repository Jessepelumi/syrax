import "server-only";

import type { drive_v3 } from "googleapis";

import type { PilotAllowedMimeType } from "@/lib/mime";
import { getAuthorizedGoogleClient, getDriveClient } from "@/server/drive/client";
import { isSafeGoogleUploadSessionUrl } from "@/server/drive/resumable-upload";

const DRIVE_RESUMABLE_CREATE_URL =
  "https://www.googleapis.com/upload/drive/v3/files";
const GUEST_UPLOAD_PURPOSE = "guest_upload";
const PROVIDER_FILE_FIELDS =
  "id,name,mimeType,size,parents,trashed,appProperties";
const SESSION_USABLE_LIFETIME_MILLISECONDS = 6 * 24 * 60 * 60 * 1000;

export type DurableUploadProviderErrorCode =
  | "PROVIDER_RATE_LIMITED"
  | "PROVIDER_REJECTED"
  | "PROVIDER_TRANSIENT_ERROR"
  | "UPLOAD_SESSION_EXPIRED"
  | "UPLOAD_SESSION_INVALID"
  | "UPLOAD_VERIFICATION_FAILED";

export class DurableUploadProviderError extends Error {
  constructor(
    readonly code: DurableUploadProviderErrorCode,
    readonly providerStatus?: number,
  ) {
    super(code);
    this.name = "DurableUploadProviderError";
  }
}

export interface DriveUploadFileMetadata {
  appProperties?: Record<string, string> | null;
  id?: string | null;
  mimeType?: string | null;
  name?: string | null;
  parents?: string[] | null;
  size?: string | null;
  trashed?: boolean | null;
}

function providerErrorCode(status: number): DurableUploadProviderErrorCode {
  if (status === 403 || status === 429) {
    return "PROVIDER_RATE_LIMITED";
  }

  if (status >= 500) {
    return "PROVIDER_TRANSIENT_ERROR";
  }

  return "PROVIDER_REJECTED";
}

function providerStatusFromError(error: unknown): number | undefined {
  if (!error || typeof error !== "object") {
    return undefined;
  }

  const candidate = error as {
    code?: number | string;
    response?: { status?: number };
  };
  const status = candidate.response?.status ?? Number(candidate.code);

  return Number.isInteger(status) && status >= 100 && status <= 599
    ? status
    : undefined;
}

function mappedGoogleApiError(error: unknown): DurableUploadProviderError {
  const status = providerStatusFromError(error);

  return new DurableUploadProviderError(
    status ? providerErrorCode(status) : "PROVIDER_TRANSIENT_ERROR",
    status,
  );
}

function equivalentProviderMimeType(
  declaredMimeType: PilotAllowedMimeType,
  providerMimeType: string | null | undefined,
): boolean {
  return (
    providerMimeType === declaredMimeType ||
    (declaredMimeType === "image/heic" && providerMimeType === "image/heif")
  );
}

function escapeDriveQueryLiteral(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("'", "\\'");
}

export function parseProviderConfirmedBytes(
  rangeHeader: string | null,
  declaredSizeBytes: number,
): number {
  if (!rangeHeader) {
    return 0;
  }

  const match = /^bytes=0-(\d+)$/.exec(rangeHeader.trim());

  if (!match) {
    throw new DurableUploadProviderError("UPLOAD_VERIFICATION_FAILED");
  }

  const finalByte = Number(match[1]);
  const confirmedBytes = finalByte + 1;

  if (
    !Number.isSafeInteger(confirmedBytes) ||
    confirmedBytes <= 0 ||
    confirmedBytes > declaredSizeBytes
  ) {
    throw new DurableUploadProviderError("UPLOAD_VERIFICATION_FAILED");
  }

  return confirmedBytes;
}

export function validateDriveUploadMetadata(input: {
  declaredMimeType: PilotAllowedMimeType;
  declaredSizeBytes: number;
  destinationFolderId: string;
  destinationName: string;
  fileId: string;
  metadata: DriveUploadFileMetadata;
  submissionId: string;
}): { providerFileId: string; sizeBytes: number } {
  const expectedSize = String(input.declaredSizeBytes);
  const metadata = input.metadata;

  if (
    !metadata.id ||
    metadata.trashed === true ||
    metadata.name !== input.destinationName ||
    metadata.size !== expectedSize ||
    !metadata.parents?.includes(input.destinationFolderId) ||
    !equivalentProviderMimeType(input.declaredMimeType, metadata.mimeType) ||
    metadata.appProperties?.syraxPurpose !== GUEST_UPLOAD_PURPOSE ||
    metadata.appProperties?.syraxFileId !== input.fileId ||
    metadata.appProperties?.syraxSubmissionId !== input.submissionId ||
    metadata.appProperties?.syraxDeclaredMimeType !== input.declaredMimeType ||
    metadata.appProperties?.syraxDeclaredSizeBytes !== expectedSize
  ) {
    throw new DurableUploadProviderError("UPLOAD_VERIFICATION_FAILED");
  }

  return { providerFileId: metadata.id, sizeBytes: input.declaredSizeBytes };
}

export async function createDriveUploadSession(input: {
  adminId: string;
  declaredMimeType: PilotAllowedMimeType;
  declaredSizeBytes: number;
  destinationFolderId: string;
  destinationName: string;
  fileId: string;
  submissionId: string;
}): Promise<{ expiresAt: Date; uploadUrl: string }> {
  const authorization = await getAuthorizedGoogleClient(input.adminId);
  const createUrl = new URL(DRIVE_RESUMABLE_CREATE_URL);
  createUrl.searchParams.set("uploadType", "resumable");
  createUrl.searchParams.set("supportsAllDrives", "true");
  createUrl.searchParams.set("fields", PROVIDER_FILE_FIELDS);

  let response: Response;

  try {
    response = await fetch(createUrl, {
      body: JSON.stringify({
        appProperties: {
          syraxDeclaredMimeType: input.declaredMimeType,
          syraxDeclaredSizeBytes: String(input.declaredSizeBytes),
          syraxFileId: input.fileId,
          syraxPurpose: GUEST_UPLOAD_PURPOSE,
          syraxSubmissionId: input.submissionId,
        },
        mimeType: input.declaredMimeType,
        name: input.destinationName,
        parents: [input.destinationFolderId],
      }),
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${authorization.accessToken}`,
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Length": String(input.declaredSizeBytes),
        "X-Upload-Content-Type": input.declaredMimeType,
      },
      method: "POST",
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    throw new DurableUploadProviderError("PROVIDER_TRANSIENT_ERROR");
  }

  if (!response.ok) {
    throw new DurableUploadProviderError(
      providerErrorCode(response.status),
      response.status,
    );
  }

  const uploadUrl = response.headers.get("location");

  if (!uploadUrl || !isSafeGoogleUploadSessionUrl(uploadUrl)) {
    throw new DurableUploadProviderError("UPLOAD_SESSION_INVALID");
  }

  return {
    uploadUrl,
    expiresAt: new Date(Date.now() + SESSION_USABLE_LIFETIME_MILLISECONDS),
  };
}

export type DriveUploadSessionStatus =
  | { kind: "complete"; metadata?: DriveUploadFileMetadata }
  | { confirmedBytes: number; kind: "incomplete" };

export async function queryDriveUploadSession(input: {
  declaredSizeBytes: number;
  uploadUrl: string;
}): Promise<DriveUploadSessionStatus> {
  if (!isSafeGoogleUploadSessionUrl(input.uploadUrl)) {
    throw new DurableUploadProviderError("UPLOAD_SESSION_INVALID");
  }

  let response: Response;

  try {
    response = await fetch(input.uploadUrl, {
      body: null,
      cache: "no-store",
      headers: {
        "Content-Length": "0",
        "Content-Range": `bytes */${input.declaredSizeBytes}`,
      },
      method: "PUT",
      redirect: "manual",
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new DurableUploadProviderError("PROVIDER_TRANSIENT_ERROR");
  }

  if (response.status === 308) {
    return {
      kind: "incomplete",
      confirmedBytes: parseProviderConfirmedBytes(
        response.headers.get("range"),
        input.declaredSizeBytes,
      ),
    };
  }

  if (response.status === 200 || response.status === 201) {
    const metadata = (await response.json().catch(() => undefined)) as
      | DriveUploadFileMetadata
      | undefined;

    return { kind: "complete", metadata };
  }

  if (response.status === 404) {
    throw new DurableUploadProviderError(
      "UPLOAD_SESSION_EXPIRED",
      response.status,
    );
  }

  throw new DurableUploadProviderError(
    providerErrorCode(response.status),
    response.status,
  );
}

async function findDriveUploadMetadata(input: {
  destinationFolderId: string;
  drive: drive_v3.Drive;
  fileId: string;
}): Promise<DriveUploadFileMetadata> {
  const destinationFolderId = escapeDriveQueryLiteral(input.destinationFolderId);
  const fileId = escapeDriveQueryLiteral(input.fileId);
  const query = `'${destinationFolderId}' in parents and appProperties has { key='syraxFileId' and value='${fileId}' } and trashed = false`;
  const retryDelayMilliseconds = [250, 750, 1_500];

  for (let attempt = 0; attempt <= retryDelayMilliseconds.length; attempt += 1) {
    let response;

    try {
      response = await input.drive.files.list(
        {
          fields: `files(${PROVIDER_FILE_FIELDS})`,
          includeItemsFromAllDrives: true,
          pageSize: 2,
          q: query,
          spaces: "drive",
          supportsAllDrives: true,
        },
        { timeout: 20_000 },
      );
    } catch (error) {
      throw mappedGoogleApiError(error);
    }
    const matches = response.data.files ?? [];

    if (matches.length === 1) {
      return matches[0];
    }

    if (matches.length > 1) {
      throw new DurableUploadProviderError("UPLOAD_VERIFICATION_FAILED");
    }

    const delay = retryDelayMilliseconds[attempt];

    if (delay) {
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw new DurableUploadProviderError("UPLOAD_VERIFICATION_FAILED");
}

export async function verifyDriveUploadCompletion(input: {
  adminId: string;
  declaredMimeType: PilotAllowedMimeType;
  declaredSizeBytes: number;
  destinationFolderId: string;
  destinationName: string;
  fileId: string;
  metadata?: DriveUploadFileMetadata;
  providerFileId?: string;
  submissionId: string;
}): Promise<{ providerFileId: string; sizeBytes: number }> {
  const { drive } = await getDriveClient(input.adminId);
  let metadata = input.metadata;

  if (!metadata && input.providerFileId) {
    try {
      metadata = (
        await drive.files.get(
          {
            fileId: input.providerFileId,
            fields: PROVIDER_FILE_FIELDS,
            supportsAllDrives: true,
          },
          { timeout: 20_000 },
        )
      ).data;
    } catch (error) {
      const status = providerStatusFromError(error);

      if (status !== 404) {
        throw mappedGoogleApiError(error);
      }
    }
  }

  if (metadata) {
    try {
      return validateDriveUploadMetadata({ ...input, metadata });
    } catch (error) {
      if (!(error instanceof DurableUploadProviderError)) {
        throw error;
      }
    }
  }

  metadata = await findDriveUploadMetadata({
    destinationFolderId: input.destinationFolderId,
    drive,
    fileId: input.fileId,
  });

  return validateDriveUploadMetadata({ ...input, metadata });
}
