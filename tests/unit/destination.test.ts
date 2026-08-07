import { describe, expect, it } from "vitest";

import {
  DestinationValidationError,
  GOOGLE_DRIVE_FOLDER_MIME_TYPE,
  validateDriveDestination,
} from "@/server/drive/destination";

const validFolder = {
  id: "folder-id",
  name: "TJWeddingGuestUpload",
  mimeType: GOOGLE_DRIVE_FOLDER_MIME_TYPE,
  trashed: false,
  capabilities: { canAddChildren: true },
};

function expectCode(input: Partial<typeof validFolder>, code: string) {
  try {
    validateDriveDestination({ ...validFolder, ...input }, validFolder.name);
    throw new Error("Expected destination validation to fail");
  } catch (error) {
    expect(error).toBeInstanceOf(DestinationValidationError);
    expect((error as DestinationValidationError).code).toBe(code);
  }
}

describe("validateDriveDestination", () => {
  it("accepts the expected writable folder", () => {
    expect(validateDriveDestination(validFolder, validFolder.name)).toEqual({
      id: validFolder.id,
      name: validFolder.name,
    });
  });

  it("rejects a non-folder item", () => {
    expectCode({ mimeType: "image/jpeg" }, "DESTINATION_NOT_FOLDER");
  });

  it("rejects a trashed folder", () => {
    expectCode({ trashed: true }, "DESTINATION_TRASHED");
  });

  it("rejects a folder that cannot accept children", () => {
    expectCode({ capabilities: { canAddChildren: false } }, "DESTINATION_NOT_WRITABLE");
  });

  it("rejects a different pilot folder name", () => {
    expectCode({ name: "AnotherFolder" }, "DESTINATION_NAME_MISMATCH");
  });
});
