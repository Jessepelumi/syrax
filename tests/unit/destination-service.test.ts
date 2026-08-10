import { beforeEach, describe, expect, it, vi } from "vitest";

import { GOOGLE_DRIVE_FOLDER_MIME_TYPE } from "@/server/drive/destination";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  get: vi.fn(),
  getDriveClient: vi.fn(),
  saveDriveDestination: vi.fn(),
}));

vi.mock("@/server/drive/client", () => ({
  getDriveClient: mocks.getDriveClient,
}));

vi.mock("@/server/drive/destination-repository", () => ({
  saveDriveDestination: mocks.saveDriveDestination,
}));

import {
  createDriveDestination,
  selectDriveDestination,
} from "@/server/drive/destination-service";

const folderMetadata = {
  id: "drive-folder-id",
  name: "Family photos",
  mimeType: GOOGLE_DRIVE_FOLDER_MIME_TYPE,
  trashed: false,
  capabilities: { canAddChildren: true },
};

describe("Drive destination service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getDriveClient.mockResolvedValue({
      connection: { id: "connection-id" },
      drive: { files: { create: mocks.create, get: mocks.get } },
    });
    mocks.saveDriveDestination.mockResolvedValue({
      id: "destination-id",
      displayName: folderMetadata.name,
      status: "ACTIVE",
    });
  });

  it("accepts and persists any writable Picker folder", async () => {
    mocks.get.mockResolvedValue({ data: folderMetadata });

    await selectDriveDestination("admin-id", folderMetadata.id);

    expect(mocks.get).toHaveBeenCalledWith(
      expect.objectContaining({
        fileId: folderMetadata.id,
        supportsAllDrives: true,
      }),
    );
    expect(mocks.saveDriveDestination).toHaveBeenCalledWith({
      adminId: "admin-id",
      connectionId: "connection-id",
      displayName: folderMetadata.name,
      providerFolderId: folderMetadata.id,
    });
  });

  it("creates a normalized root-level folder and selects it", async () => {
    mocks.create.mockResolvedValue({ data: folderMetadata });

    await createDriveDestination("admin-id", "  Family\u202e   photos  ");

    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        requestBody: {
          mimeType: GOOGLE_DRIVE_FOLDER_MIME_TYPE,
          name: "Family photos",
        },
        supportsAllDrives: true,
      }),
    );
    expect(mocks.create.mock.calls[0]?.[0].requestBody).not.toHaveProperty("parents");
    expect(mocks.saveDriveDestination).toHaveBeenCalledWith(
      expect.objectContaining({ providerFolderId: folderMetadata.id }),
    );
  });
});
