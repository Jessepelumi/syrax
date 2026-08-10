import { describe, expect, it } from "vitest";

import {
  DestinationValidationError,
  GOOGLE_DRIVE_FOLDER_MIME_TYPE,
  validateDriveDestination,
} from "@/server/drive/destination";

const validFolder = {
  id: "folder-id",
  name: "Family uploads",
  mimeType: GOOGLE_DRIVE_FOLDER_MIME_TYPE,
  trashed: false,
  capabilities: { canAddChildren: true },
};

function expectCode(input: Partial<typeof validFolder>, code: string) {
  try {
    validateDriveDestination({ ...validFolder, ...input });
    throw new Error("Expected destination validation to fail");
  } catch (error) {
    expect(error).toBeInstanceOf(DestinationValidationError);
    expect((error as DestinationValidationError).code).toBe(code);
  }
}

describe("validateDriveDestination", () => {
  it("accepts any writable folder", () => {
    expect(validateDriveDestination({ ...validFolder, name: "Family uploads" })).toEqual({
      id: validFolder.id,
      name: "Family uploads",
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
});
