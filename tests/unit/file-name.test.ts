import { describe, expect, it } from "vitest";

import {
  createDestinationFileName,
  sanitizeOriginalFileName,
} from "@/server/uploads/file-name";

describe("sanitizeOriginalFileName", () => {
  it("removes path, control, and Unicode directionality characters", () => {
    expect(sanitizeOriginalFileName("../album\\\u202Ephoto\u0000.jpg")).toBe(
      "album_photo.jpg",
    );
  });

  it("uses a safe fallback for an empty result", () => {
    expect(sanitizeOriginalFileName("../..")).toBe("upload");
  });

  it("bounds stored display metadata", () => {
    expect(Array.from(sanitizeOriginalFileName("a".repeat(300))).length).toBe(180);
  });
});

describe("createDestinationFileName", () => {
  it("creates a UTC, collision-safe name with a MIME-derived extension", () => {
    expect(
      createDestinationFileName({
        fileId: "file_ABCDEFGHijkl",
        mimeType: "image/heic",
        originalName: "Wedding photo.exe",
        submissionId: "submission_12345678abcd",
        uploadedAt: new Date("2026-08-15T23:30:00.000Z"),
      }),
    ).toEqual({
      destinationName: "20260815_12345678_abcdefgh_Wedding photo.heic",
      sanitizedOriginalName: "Wedding photo.exe",
    });
  });

  it("bounds the final provider name", () => {
    const result = createDestinationFileName({
      fileId: "file_abcdefgh",
      mimeType: "image/jpeg",
      originalName: `${"p".repeat(300)}.jpeg`,
      submissionId: "submission_12345678",
      uploadedAt: new Date("2026-08-15T00:00:00.000Z"),
    });

    expect(Array.from(result.destinationName).length).toBeLessThanOrEqual(240);
    expect(result.destinationName.endsWith(".jpg")).toBe(true);
  });
});
