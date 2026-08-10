import { describe, expect, it } from "vitest";

import { getAggregateUploadProgress } from "@/lib/upload-progress";

describe("getAggregateUploadProgress", () => {
  it("combines confirmed bytes and completed image count", () => {
    expect(
      getAggregateUploadProgress([
        { confirmedBytes: 100, sizeBytes: 100, status: "COMPLETED" },
        { confirmedBytes: 50, sizeBytes: 200, status: "UPLOADING" },
        { confirmedBytes: 0, sizeBytes: 300, status: "QUEUED" },
      ]),
    ).toEqual({
      completedFiles: 1,
      confirmedBytes: 150,
      totalBytes: 600,
      totalFiles: 3,
    });
  });

  it("clamps invalid and over-reported byte counts", () => {
    expect(
      getAggregateUploadProgress([
        { confirmedBytes: 200, sizeBytes: 100, status: "UPLOADING" },
        { confirmedBytes: -1, sizeBytes: 50, status: "FAILED" },
      ]),
    ).toMatchObject({ confirmedBytes: 100, totalBytes: 150 });
  });
});
