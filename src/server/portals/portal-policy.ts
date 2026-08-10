import "server-only";

export type PortalPolicyErrorCode =
  | "DUPLICATE_CLIENT_FILE_ID"
  | "FILE_COUNT_INVALID"
  | "FILE_METADATA_INVALID"
  | "FILE_TOO_LARGE"
  | "FILE_TYPE_NOT_ALLOWED"
  | "SUBMISSION_TOO_LARGE";

export class PortalPolicyError extends Error {
  constructor(readonly code: PortalPolicyErrorCode) {
    super(code);
    this.name = "PortalPolicyError";
  }
}

export interface SubmissionFilePlan {
  clientFileId: string;
  mimeType: string;
  name: string;
  sizeBytes: number;
}

export interface PortalSubmissionPolicy {
  allowedMimeTypes: readonly string[];
  maxFileSizeBytes: number;
  maxFilesPerSubmission: number;
  maxSubmissionBytes: number;
}

export interface ValidatedSubmissionPlan {
  fileCount: number;
  totalDeclaredBytes: number;
}

function isPositiveSafeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

export function validateSubmissionPlan(
  policy: PortalSubmissionPolicy,
  files: readonly SubmissionFilePlan[],
): ValidatedSubmissionPlan {
  if (
    !Number.isSafeInteger(policy.maxFilesPerSubmission) ||
    policy.maxFilesPerSubmission <= 0 ||
    !isPositiveSafeInteger(policy.maxFileSizeBytes) ||
    !isPositiveSafeInteger(policy.maxSubmissionBytes) ||
    policy.maxSubmissionBytes < policy.maxFileSizeBytes ||
    policy.allowedMimeTypes.length === 0
  ) {
    throw new PortalPolicyError("FILE_METADATA_INVALID");
  }

  if (files.length === 0 || files.length > policy.maxFilesPerSubmission) {
    throw new PortalPolicyError("FILE_COUNT_INVALID");
  }

  const allowedMimeTypes = new Set(policy.allowedMimeTypes);
  const clientFileIds = new Set<string>();
  let totalDeclaredBytes = 0;

  for (const file of files) {
    if (
      !file.clientFileId ||
      !file.name ||
      !file.mimeType ||
      !isPositiveSafeInteger(file.sizeBytes)
    ) {
      throw new PortalPolicyError("FILE_METADATA_INVALID");
    }

    if (clientFileIds.has(file.clientFileId)) {
      throw new PortalPolicyError("DUPLICATE_CLIENT_FILE_ID");
    }

    clientFileIds.add(file.clientFileId);

    if (!allowedMimeTypes.has(file.mimeType)) {
      throw new PortalPolicyError("FILE_TYPE_NOT_ALLOWED");
    }

    if (file.sizeBytes > policy.maxFileSizeBytes) {
      throw new PortalPolicyError("FILE_TOO_LARGE");
    }

    totalDeclaredBytes += file.sizeBytes;

    if (
      !Number.isSafeInteger(totalDeclaredBytes) ||
      totalDeclaredBytes > policy.maxSubmissionBytes
    ) {
      throw new PortalPolicyError("SUBMISSION_TOO_LARGE");
    }
  }

  return { fileCount: files.length, totalDeclaredBytes };
}
