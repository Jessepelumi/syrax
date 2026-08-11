import { describe, expect, it, vi } from "vitest";

const environment = vi.hoisted(() => ({
  APP_BASE_URL: "https://syrax.example",
  TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 29).toString("base64"),
}));

const mocks = vi.hoisted(() => ({
  deleteInactivePortalRecordForAdmin: vi.fn(),
  expirePortalRecord: vi.fn(),
  getPortalForAdmin: vi.fn(),
  listPortalRecordsForAdmin: vi.fn(),
  updatePortalExpiryRecordForAdmin: vi.fn(),
}));

vi.mock("@/lib/env", () => ({
  getEnvironment: () => ({
    ...environment,
    MAX_IMAGE_BYTES_PER_SUBMISSION: 300,
    MAX_IMAGE_FILE_SIZE_BYTES: 100,
    MAX_FILES_PER_SUBMISSION: 10,
    MAX_SUBMISSION_BYTES: 1_000,
    MAX_VIDEO_BYTES_PER_SUBMISSION: 700,
    MAX_VIDEO_FILE_SIZE_BYTES: 200,
  }),
}));

vi.mock("@/server/portals/portal-repository", () => ({
  createPortalRecordForAdmin: vi.fn(),
  deleteInactivePortalRecordForAdmin: mocks.deleteInactivePortalRecordForAdmin,
  expirePortalRecord: mocks.expirePortalRecord,
  findPortalByPublicTokenHash: vi.fn(),
  getPortalForAdmin: mocks.getPortalForAdmin,
  listPortalRecordsForAdmin: mocks.listPortalRecordsForAdmin,
  transitionPortalRecordForAdmin: vi.fn(),
  updatePortalExpiryRecordForAdmin: mocks.updatePortalExpiryRecordForAdmin,
}));

import {
  deleteInactivePortalForAdmin,
  listPortalsForAdmin,
  PortalServiceError,
  updatePortalExpiryForAdmin,
} from "@/server/portals/portal-service";
import { hashPortalToken } from "@/server/portals/portal-token";
import { createPortalTokenVault } from "@/server/portals/portal-token-vault";

const publicToken = "a".repeat(43);
const publicTokenHash = hashPortalToken(publicToken);
const encryptedPublicToken = createPortalTokenVault(
  environment.TOKEN_ENCRYPTION_KEY,
).encrypt(publicToken, publicTokenHash);

function portalRecord(status: "OPEN" | "CLOSED" | "EXPIRED") {
  return {
    allowedMimeTypes: ["image/jpeg"],
    connectionStatus: "ACTIVE" as const,
    createdAt: new Date("2026-08-10T12:00:00.000Z"),
    destinationId: "destination-id",
    destinationStatus: "ACTIVE" as const,
    encryptedPublicToken,
    expiresAt: new Date("2099-08-31T23:59:59.000Z"),
    id: "portal-id",
    legacyMaxFileSizeBytes: 200,
    maxImageBytesPerSubmission: 300,
    maxImageFileSizeBytes: 100,
    maxFilesPerSubmission: 10,
    maxSubmissionBytes: 1_000,
    maxVideoBytesPerSubmission: 700,
    maxVideoFileSizeBytes: 200,
    name: "Wedding photos",
    publicTokenHash,
    status,
    updatedAt: new Date("2026-08-10T12:00:00.000Z"),
  };
}

describe("admin portal links", () => {
  it("reveals the encrypted link for an open portal", async () => {
    mocks.listPortalRecordsForAdmin.mockResolvedValue([portalRecord("OPEN")]);

    const [portal] = await listPortalsForAdmin("admin-id");

    expect(portal.portalUrl).toBe(`https://syrax.example/upload/${publicToken}`);
  });

  it("does not expose the link while a portal is closed", async () => {
    mocks.listPortalRecordsForAdmin.mockResolvedValue([portalRecord("CLOSED")]);

    const [portal] = await listPortalsForAdmin("admin-id");

    expect(portal.portalUrl).toBeUndefined();
  });

  it("deletes a portal when the repository confirms it is inactive", async () => {
    mocks.deleteInactivePortalRecordForAdmin.mockResolvedValue({ kind: "deleted" });

    await expect(
      deleteInactivePortalForAdmin({ adminId: "admin-id", portalId: "portal-id" }),
    ).resolves.toBeUndefined();
    expect(mocks.deleteInactivePortalRecordForAdmin).toHaveBeenCalledWith({
      actorId: "admin-id",
      portalId: "portal-id",
    });
  });

  it("rejects deletion unless the portal is closed or expired", async () => {
    mocks.deleteInactivePortalRecordForAdmin.mockResolvedValue({
      kind: "not_deletable",
    });

    await expect(
      deleteInactivePortalForAdmin({ adminId: "admin-id", portalId: "portal-id" }),
    ).rejects.toEqual(new PortalServiceError("PORTAL_NOT_DELETABLE"));
  });

  it("updates an owned unexpired portal and retains its admin link", async () => {
    const updatedRecord = {
      ...portalRecord("OPEN"),
      expiresAt: new Date("2099-09-15T12:30:00.000Z"),
    };
    mocks.updatePortalExpiryRecordForAdmin.mockResolvedValue({
      kind: "updated",
      portal: updatedRecord,
    });
    mocks.getPortalForAdmin.mockResolvedValue(updatedRecord);

    const updated = await updatePortalExpiryForAdmin({
      adminId: "admin-id",
      expiresAt: updatedRecord.expiresAt,
      portalId: "portal-id",
    });

    expect(updated.expiresAt).toEqual(updatedRecord.expiresAt);
    expect(updated.portalUrl).toBe(`https://syrax.example/upload/${publicToken}`);
    expect(mocks.updatePortalExpiryRecordForAdmin).toHaveBeenCalledWith({
      actorId: "admin-id",
      expiresAt: updatedRecord.expiresAt,
      portalId: "portal-id",
    });
  });

  it("does not allow an expired portal to be revived by editing its expiry", async () => {
    mocks.updatePortalExpiryRecordForAdmin.mockResolvedValue({ kind: "expired" });

    await expect(
      updatePortalExpiryForAdmin({
        adminId: "admin-id",
        expiresAt: new Date("2099-09-15T12:30:00.000Z"),
        portalId: "portal-id",
      }),
    ).rejects.toEqual(new PortalServiceError("PORTAL_EXPIRED"));
  });
});
