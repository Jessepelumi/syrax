import { describe, expect, it } from "vitest";

import {
  DurableUploadProviderError,
  parseProviderConfirmedBytes,
  validateDriveUploadMetadata,
} from "@/server/drive/durable-upload";

const input = {
  declaredMimeType: "image/jpeg" as const,
  declaredSizeBytes: 4_096,
  destinationFolderId: "folder-id",
  destinationName: "20260815_submission_file_photo.jpg",
  fileId: "file_abc123",
  submissionId: "submission_xyz789",
};

const metadata = {
  appProperties: {
    syraxDeclaredMimeType: input.declaredMimeType,
    syraxDeclaredSizeBytes: String(input.declaredSizeBytes),
    syraxFileId: input.fileId,
    syraxPurpose: "guest_upload",
    syraxSubmissionId: input.submissionId,
  },
  id: "provider-file",
  mimeType: input.declaredMimeType,
  name: input.destinationName,
  parents: [input.destinationFolderId],
  size: String(input.declaredSizeBytes),
  trashed: false,
};

describe("parseProviderConfirmedBytes", () => {
  it("converts Google's inclusive byte range to the next offset", () => {
    expect(parseProviderConfirmedBytes("bytes=0-42", 100)).toBe(43);
    expect(parseProviderConfirmedBytes(null, 100)).toBe(0);
  });

  it.each(["bytes=1-42", "0-42", "bytes=0-100", "invalid"])(
    "rejects an invalid provider range: %s",
    (range) => {
      expect(() => parseProviderConfirmedBytes(range, 100)).toThrow(
        DurableUploadProviderError,
      );
    },
  );
});

describe("validateDriveUploadMetadata", () => {
  it("accepts the exact provider-confirmed guest file", () => {
    expect(validateDriveUploadMetadata({ ...input, metadata })).toEqual({
      providerFileId: metadata.id,
      sizeBytes: input.declaredSizeBytes,
    });
  });

  it("accepts Drive normalizing declared HEIC to HEIF", () => {
    expect(
      validateDriveUploadMetadata({
        ...input,
        declaredMimeType: "image/heic",
        metadata: {
          ...metadata,
          appProperties: {
            ...metadata.appProperties,
            syraxDeclaredMimeType: "image/heic",
          },
          mimeType: "image/heif",
        },
      }),
    ).toEqual({ providerFileId: metadata.id, sizeBytes: input.declaredSizeBytes });
  });

  it("accepts provider-confirmed MP4 video metadata", () => {
    expect(
      validateDriveUploadMetadata({
        ...input,
        declaredMimeType: "video/mp4",
        destinationName: "20260815_submission_file_clip.mp4",
        metadata: {
          ...metadata,
          appProperties: {
            ...metadata.appProperties,
            syraxDeclaredMimeType: "video/mp4",
          },
          mimeType: "video/mp4",
          name: "20260815_submission_file_clip.mp4",
        },
      }),
    ).toEqual({ providerFileId: metadata.id, sizeBytes: input.declaredSizeBytes });
  });

  it.each([
    { name: "wrong name", value: { ...metadata, name: "other.jpg" } },
    { name: "wrong folder", value: { ...metadata, parents: ["other"] } },
    {
      name: "wrong file capability",
      value: {
        ...metadata,
        appProperties: { ...metadata.appProperties, syraxFileId: "file_other" },
      },
    },
    { name: "wrong byte count", value: { ...metadata, size: "4095" } },
  ])("rejects $name", ({ value }) => {
    expect(() => validateDriveUploadMetadata({ ...input, metadata: value })).toThrow(
      DurableUploadProviderError,
    );
  });
});
