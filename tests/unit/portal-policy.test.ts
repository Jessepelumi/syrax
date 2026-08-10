import { describe, expect, it } from "vitest";

import {
  PortalPolicyError,
  type PortalPolicyErrorCode,
  type PortalSubmissionPolicy,
  type SubmissionFilePlan,
  validateSubmissionPlan,
} from "@/server/portals/portal-policy";

const policy = {
  allowedMimeTypes: ["image/jpeg", "image/heic", "image/png"],
  maxFileSizeBytes: 10_000,
  maxFilesPerSubmission: 3,
  maxSubmissionBytes: 20_000,
} satisfies PortalSubmissionPolicy;

const jpeg = {
  clientFileId: "browser-file-1",
  mimeType: "image/jpeg",
  name: "photo.jpg",
  sizeBytes: 4_000,
} satisfies SubmissionFilePlan;

function expectPolicyError(
  expectedCode: PortalPolicyErrorCode,
  files: readonly SubmissionFilePlan[],
  submissionPolicy: PortalSubmissionPolicy = policy,
): void {
  try {
    validateSubmissionPlan(submissionPolicy, files);
    throw new Error("Expected validation to fail");
  } catch (error) {
    expect(error).toBeInstanceOf(PortalPolicyError);
    expect((error as PortalPolicyError).code).toBe(expectedCode);
  }
}

describe("validateSubmissionPlan", () => {
  it("returns the authoritative count and aggregate declared bytes", () => {
    const result = validateSubmissionPlan(policy, [
      jpeg,
      {
        clientFileId: "browser-file-2",
        mimeType: "image/heic",
        name: "IMG_0002.HEIC",
        sizeBytes: 6_000,
      },
    ]);

    expect(result).toEqual({ fileCount: 2, totalDeclaredBytes: 10_000 });
  });

  it("rejects empty and over-limit file lists", () => {
    expectPolicyError("FILE_COUNT_INVALID", []);
    expectPolicyError("FILE_COUNT_INVALID", [
      jpeg,
      { ...jpeg, clientFileId: "browser-file-2" },
      { ...jpeg, clientFileId: "browser-file-3" },
      { ...jpeg, clientFileId: "browser-file-4" },
    ]);
  });

  it("rejects duplicate browser idempotency values", () => {
    expectPolicyError("DUPLICATE_CLIENT_FILE_ID", [jpeg, { ...jpeg }]);
  });

  it("rejects MIME types outside the portal's exact allowlist", () => {
    expectPolicyError("FILE_TYPE_NOT_ALLOWED", [
      { ...jpeg, mimeType: "image/gif" },
    ]);
  });

  it("rejects a file larger than the per-file limit", () => {
    expectPolicyError("FILE_TOO_LARGE", [{ ...jpeg, sizeBytes: 10_001 }]);
  });

  it("rejects an aggregate larger than the submission limit", () => {
    expectPolicyError("SUBMISSION_TOO_LARGE", [
      { ...jpeg, sizeBytes: 10_000 },
      { ...jpeg, clientFileId: "browser-file-2", sizeBytes: 10_000 },
      { ...jpeg, clientFileId: "browser-file-3", sizeBytes: 1 },
    ]);
  });

  it.each([
    { field: "clientFileId", value: "" },
    { field: "name", value: "" },
    { field: "mimeType", value: "" },
    { field: "sizeBytes", value: 0 },
    { field: "sizeBytes", value: Number.MAX_SAFE_INTEGER + 1 },
  ] as const)("rejects invalid $field metadata", ({ field, value }) => {
    expectPolicyError("FILE_METADATA_INVALID", [
      { ...jpeg, [field]: value } as SubmissionFilePlan,
    ]);
  });

  it("rejects internally inconsistent portal limits", () => {
    expectPolicyError("FILE_METADATA_INVALID", [jpeg], {
      ...policy,
      maxSubmissionBytes: policy.maxFileSizeBytes - 1,
    });
  });
});
