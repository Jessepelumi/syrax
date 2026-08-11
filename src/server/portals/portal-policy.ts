import "server-only";

import { uploadFileCategoryForMimeType } from "@/lib/mime";

export type PortalPolicyErrorCode =
  | "DUPLICATE_CLIENT_FILE_ID"
  | "FILE_COUNT_INVALID"
  | "FILE_METADATA_INVALID"
  | "FILE_TOO_LARGE"
  | "FILE_TYPE_NOT_ALLOWED"
  | "IMAGE_SUBMISSION_TOO_LARGE"
  | "SUBMISSION_TOO_LARGE"
  | "VIDEO_SUBMISSION_TOO_LARGE";

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
  maxImageBytesPerSubmission: number;
  maxImageFileSizeBytes: number;
  maxFilesPerSubmission: number;
  maxSubmissionBytes: number;
  maxVideoBytesPerSubmission: number;
  maxVideoFileSizeBytes: number;
}

export interface ValidatedSubmissionPlan {
  fileCount: number;
  imageDeclaredBytes: number;
  totalDeclaredBytes: number;
  videoDeclaredBytes: number;
}

function isPositiveSafeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

export function validateSubmissionPlan(
  policy: PortalSubmissionPolicy,
  files: readonly SubmissionFilePlan[],
): ValidatedSubmissionPlan {
  const combinedCategoryBudget =
    policy.maxImageBytesPerSubmission + policy.maxVideoBytesPerSubmission;

  if (
    !Number.isSafeInteger(policy.maxFilesPerSubmission) ||
    policy.maxFilesPerSubmission <= 0 ||
    !isPositiveSafeInteger(policy.maxImageBytesPerSubmission) ||
    !isPositiveSafeInteger(policy.maxImageFileSizeBytes) ||
    !isPositiveSafeInteger(policy.maxVideoBytesPerSubmission) ||
    !isPositiveSafeInteger(policy.maxVideoFileSizeBytes) ||
    !isPositiveSafeInteger(policy.maxSubmissionBytes) ||
    policy.maxImageBytesPerSubmission < policy.maxImageFileSizeBytes ||
    policy.maxVideoBytesPerSubmission < policy.maxVideoFileSizeBytes ||
    !Number.isSafeInteger(combinedCategoryBudget) ||
    policy.maxSubmissionBytes < combinedCategoryBudget ||
    policy.allowedMimeTypes.length === 0
  ) {
    throw new PortalPolicyError("FILE_METADATA_INVALID");
  }

  if (files.length === 0 || files.length > policy.maxFilesPerSubmission) {
    throw new PortalPolicyError("FILE_COUNT_INVALID");
  }

  const allowedMimeTypes = new Set(policy.allowedMimeTypes);
  const clientFileIds = new Set<string>();
  let imageDeclaredBytes = 0;
  let totalDeclaredBytes = 0;
  let videoDeclaredBytes = 0;

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

    const category = uploadFileCategoryForMimeType(file.mimeType);

    if (!allowedMimeTypes.has(file.mimeType) || !category) {
      throw new PortalPolicyError("FILE_TYPE_NOT_ALLOWED");
    }

    const maxFileSizeBytes =
      category === "VIDEO"
        ? policy.maxVideoFileSizeBytes
        : policy.maxImageFileSizeBytes;

    if (file.sizeBytes > maxFileSizeBytes) {
      throw new PortalPolicyError("FILE_TOO_LARGE");
    }

    if (category === "VIDEO") {
      videoDeclaredBytes += file.sizeBytes;

      if (
        !Number.isSafeInteger(videoDeclaredBytes) ||
        videoDeclaredBytes > policy.maxVideoBytesPerSubmission
      ) {
        throw new PortalPolicyError("VIDEO_SUBMISSION_TOO_LARGE");
      }
    } else {
      imageDeclaredBytes += file.sizeBytes;

      if (
        !Number.isSafeInteger(imageDeclaredBytes) ||
        imageDeclaredBytes > policy.maxImageBytesPerSubmission
      ) {
        throw new PortalPolicyError("IMAGE_SUBMISSION_TOO_LARGE");
      }
    }

    totalDeclaredBytes += file.sizeBytes;

    if (
      !Number.isSafeInteger(totalDeclaredBytes) ||
      totalDeclaredBytes > policy.maxSubmissionBytes
    ) {
      throw new PortalPolicyError("SUBMISSION_TOO_LARGE");
    }
  }

  return {
    fileCount: files.length,
    imageDeclaredBytes,
    totalDeclaredBytes,
    videoDeclaredBytes,
  };
}
