import { describe, expect, it } from "vitest";

import {
  createFeasibilityDestinationName,
  FEASIBILITY_UPLOAD_ID_PATTERN,
  FeasibilityUploadError,
  isSafeGoogleUploadSessionUrl,
  validateFeasibilityUploadMetadata,
} from "@/server/drive/resumable-upload";

const uploadId = "spike_testuploadid";
const destinationFolderId = "destination-folder";
const validMetadata = {
  appProperties: {
    syraxDeclaredMimeType: "image/jpeg",
    syraxDeclaredSizeBytes: "4096",
    syraxPurpose: "feasibility",
    syraxUploadId: uploadId,
  },
  id: "provider-file",
  mimeType: "image/jpeg",
  name: `syrax-feasibility-${uploadId}.jpg`,
  parents: [destinationFolderId],
  size: "4096",
  trashed: false,
};

function expectVerificationFailure(
  metadata: Parameters<typeof validateFeasibilityUploadMetadata>[0]["metadata"],
): void {
  try {
    validateFeasibilityUploadMetadata({ destinationFolderId, metadata, uploadId });
    throw new Error("Expected verification to fail");
  } catch (error) {
    expect(error).toBeInstanceOf(FeasibilityUploadError);
    expect((error as FeasibilityUploadError).code).toBe(
      "UPLOAD_VERIFICATION_FAILED",
    );
  }
}

describe("createFeasibilityDestinationName", () => {
  it("derives controlled extensions from allowed MIME types", () => {
    expect(createFeasibilityDestinationName(uploadId, "image/jpeg")).toBe(
      `syrax-feasibility-${uploadId}.jpg`,
    );
    expect(createFeasibilityDestinationName(uploadId, "image/png")).toBe(
      `syrax-feasibility-${uploadId}.png`,
    );
    expect(createFeasibilityDestinationName(uploadId, "image/heic")).toBe(
      `syrax-feasibility-${uploadId}.heic`,
    );
  });
});

describe("FEASIBILITY_UPLOAD_ID_PATTERN", () => {
  it("allows generated opaque IDs and rejects Drive-query metacharacters", () => {
    expect(FEASIBILITY_UPLOAD_ID_PATTERN.test("spike_aqxq0qzs6m39hgyueumvrdzy")).toBe(
      true,
    );
    expect(FEASIBILITY_UPLOAD_ID_PATTERN.test("spike_bad'value")).toBe(false);
    expect(FEASIBILITY_UPLOAD_ID_PATTERN.test("spike_bad\\value")).toBe(false);
  });
});

describe("isSafeGoogleUploadSessionUrl", () => {
  it("accepts the documented Drive resumable-session URL", () => {
    expect(
      isSafeGoogleUploadSessionUrl(
        "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=opaque",
      ),
    ).toBe(true);
  });

  it.each([
    "http://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=opaque",
    "https://evil.example/upload/drive/v3/files?uploadType=resumable&upload_id=opaque",
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable",
    "https://www.googleapis.com/drive/v3/files?uploadType=resumable&upload_id=opaque",
    "not-a-url",
  ])("rejects an unsafe or malformed session URL: %s", (value) => {
    expect(isSafeGoogleUploadSessionUrl(value)).toBe(false);
  });
});

describe("validateFeasibilityUploadMetadata", () => {
  it("accepts the expected provider-confirmed file", () => {
    expect(
      validateFeasibilityUploadMetadata({
        destinationFolderId,
        metadata: validMetadata,
        uploadId,
      }),
    ).toEqual({
      destinationName: validMetadata.name,
      mimeType: "image/jpeg",
      providerFileId: validMetadata.id,
      sizeBytes: 4096,
    });
  });

  it("accepts Drive normalizing declared HEIC to registered HEIF MIME", () => {
    const heicMetadata = {
      ...validMetadata,
      appProperties: {
        ...validMetadata.appProperties,
        syraxDeclaredMimeType: "image/heic",
      },
      mimeType: "image/heif",
      name: `syrax-feasibility-${uploadId}.heic`,
    };

    expect(
      validateFeasibilityUploadMetadata({
        destinationFolderId,
        metadata: heicMetadata,
        uploadId,
      }),
    ).toEqual({
      destinationName: heicMetadata.name,
      mimeType: "image/heic",
      providerFileId: heicMetadata.id,
      sizeBytes: 4096,
    });
  });

  it("does not apply HEIC/HEIF equivalence to other declarations", () => {
    expectVerificationFailure({ ...validMetadata, mimeType: "image/heif" });
  });

  it("rejects a file outside the selected destination", () => {
    expectVerificationFailure({ ...validMetadata, parents: ["other-folder"] });
  });

  it("rejects a mismatched upload capability", () => {
    expectVerificationFailure({
      ...validMetadata,
      appProperties: {
        ...validMetadata.appProperties,
        syraxUploadId: "spike_other",
      },
    });
  });

  it("rejects metadata that disagrees with declared bytes", () => {
    expectVerificationFailure({ ...validMetadata, size: "4095" });
  });

  it("rejects a renamed or trashed file", () => {
    expectVerificationFailure({ ...validMetadata, name: "renamed.jpg" });
    expectVerificationFailure({ ...validMetadata, trashed: true });
  });
});
