import "server-only";

import { timingSafeEqual } from "node:crypto";

import type { Portal } from "@/db/schema";
import { getEnvironment } from "@/lib/env";
import { PILOT_ALLOWED_MIME_TYPES } from "@/lib/mime";
import { normalizeDisplayText } from "@/lib/text";
import {
  createPortalRecordForAdmin,
  deleteClosedPortalRecordForAdmin,
  expirePortalRecord,
  findPortalByPublicTokenHash,
  getPortalForAdmin,
  listPortalRecordsForAdmin,
  type AdminPortalProviderRecord,
  type PortalRecord,
  type PortalProviderRecord,
  transitionPortalRecordForAdmin,
} from "@/server/portals/portal-repository";
import {
  assertPortalTransition,
  type PortalState,
  PortalStateTransitionError,
} from "@/server/portals/portal-state";
import { createPortalTokenVault } from "@/server/portals/portal-token-vault";
import {
  generatePortalToken,
  hashPortalToken,
  isPortalTokenShape,
} from "@/server/portals/portal-token";

export type PortalServiceErrorCode =
  | "DESTINATION_UNAVAILABLE"
  | "PORTAL_ALREADY_OPEN"
  | "PORTAL_CLOSED"
  | "PORTAL_EXPIRED"
  | "PORTAL_INVALID"
  | "PORTAL_NOT_CLOSED"
  | "PORTAL_NOT_FOUND"
  | "PORTAL_STATE_CONFLICT";

export class PortalServiceError extends Error {
  constructor(readonly code: PortalServiceErrorCode) {
    super(code);
    this.name = "PortalServiceError";
  }
}

export interface PublicPortal {
  allowedMimeTypes: string[];
  destinationAvailable: boolean;
  expiresAt: Date;
  id: string;
  maxFileSizeBytes: number;
  maxFilesPerSubmission: number;
  maxSubmissionBytes: number;
  name: string;
  status: PortalState;
}

export interface AdminPortal extends PublicPortal {
  portalUrl?: string;
}

function isExpired(portal: Pick<Portal, "expiresAt" | "status">, now = new Date()): boolean {
  return portal.status === "EXPIRED" || portal.expiresAt.getTime() <= now.getTime();
}

function toPublicPortal(record: PortalProviderRecord, status = record.status): PublicPortal {
  return {
    id: record.id,
    name: record.name,
    status,
    expiresAt: record.expiresAt,
    allowedMimeTypes: record.allowedMimeTypes,
    maxFileSizeBytes: record.maxFileSizeBytes,
    maxFilesPerSubmission: record.maxFilesPerSubmission,
    maxSubmissionBytes: record.maxSubmissionBytes,
    destinationAvailable:
      record.connectionStatus === "ACTIVE" && record.destinationStatus === "ACTIVE",
  };
}

async function normalizeExpiry(record: PortalProviderRecord): Promise<PublicPortal> {
  if (!isExpired(record)) {
    return toPublicPortal(record);
  }

  if (record.status !== "EXPIRED") {
    await expirePortalRecord(record.id);
  }

  return toPublicPortal(record, "EXPIRED");
}

function equalTokenHash(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");

  return (
    leftBuffer.byteLength === rightBuffer.byteLength &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function toAdminPortal(
  record: AdminPortalProviderRecord,
  status = record.status,
): AdminPortal {
  const portal: AdminPortal = toPublicPortal(record, status);

  if (status !== "OPEN" || !record.encryptedPublicToken) {
    return portal;
  }

  try {
    const environment = getEnvironment();
    const publicToken = createPortalTokenVault(
      environment.TOKEN_ENCRYPTION_KEY,
    ).decrypt(record.encryptedPublicToken, record.publicTokenHash);

    if (
      !isPortalTokenShape(publicToken) ||
      !equalTokenHash(hashPortalToken(publicToken), record.publicTokenHash)
    ) {
      return portal;
    }

    portal.portalUrl = new URL(
      `/upload/${encodeURIComponent(publicToken)}`,
      environment.APP_BASE_URL,
    ).toString();
  } catch {
    return portal;
  }

  return portal;
}

async function normalizeAdminExpiry(
  record: AdminPortalProviderRecord,
): Promise<AdminPortal> {
  if (!isExpired(record)) {
    return toAdminPortal(record);
  }

  if (record.status !== "EXPIRED") {
    await expirePortalRecord(record.id);
  }

  return toAdminPortal(record, "EXPIRED");
}

export async function createPortalForAdmin(input: {
  adminId: string;
  expiresAt: Date;
  name: string;
}): Promise<{ portal: PortalRecord; publicToken: string }> {
  const environment = getEnvironment();
  const name = normalizeDisplayText(input.name, 120);

  if (!name || name.length > 120 || input.expiresAt.getTime() <= Date.now()) {
    throw new PortalServiceError("PORTAL_INVALID");
  }

  const generated = generatePortalToken();
  const encryptedPublicToken = createPortalTokenVault(
    environment.TOKEN_ENCRYPTION_KEY,
  ).encrypt(generated.publicToken, generated.publicTokenHash);
  const result = await createPortalRecordForAdmin({
    adminId: input.adminId,
    name,
    expiresAt: input.expiresAt,
    encryptedPublicToken,
    publicTokenHash: generated.publicTokenHash,
    allowedMimeTypes: [...PILOT_ALLOWED_MIME_TYPES],
    maxFileSizeBytes: environment.MAX_FILE_SIZE_BYTES,
    maxFilesPerSubmission: environment.MAX_FILES_PER_SUBMISSION,
    maxSubmissionBytes: environment.MAX_SUBMISSION_BYTES,
  });

  if (result.kind === "destination_unavailable") {
    throw new PortalServiceError("DESTINATION_UNAVAILABLE");
  }

  if (result.kind === "portal_already_open") {
    throw new PortalServiceError("PORTAL_ALREADY_OPEN");
  }

  return { portal: result.portal, publicToken: generated.publicToken };
}

export async function resolvePublicPortal(publicToken: string): Promise<PublicPortal | null> {
  if (!isPortalTokenShape(publicToken)) {
    return null;
  }

  const record = await findPortalByPublicTokenHash(hashPortalToken(publicToken));

  return record ? normalizeExpiry(record) : null;
}

export function assertPortalAcceptsSubmissions(portal: PublicPortal): void {
  if (portal.status === "EXPIRED") {
    throw new PortalServiceError("PORTAL_EXPIRED");
  }

  if (portal.status !== "OPEN") {
    throw new PortalServiceError("PORTAL_CLOSED");
  }

  if (!portal.destinationAvailable) {
    throw new PortalServiceError("DESTINATION_UNAVAILABLE");
  }
}

export async function listPortalsForAdmin(adminId: string): Promise<AdminPortal[]> {
  const records = await listPortalRecordsForAdmin(adminId);

  return Promise.all(records.map(normalizeAdminExpiry));
}

export async function deleteClosedPortalForAdmin(input: {
  adminId: string;
  portalId: string;
}): Promise<void> {
  const result = await deleteClosedPortalRecordForAdmin({
    actorId: input.adminId,
    portalId: input.portalId,
  });

  if (result.kind === "not_found") {
    throw new PortalServiceError("PORTAL_NOT_FOUND");
  }

  if (result.kind === "not_closed") {
    throw new PortalServiceError("PORTAL_NOT_CLOSED");
  }
}

export async function transitionPortalForAdmin(input: {
  adminId: string;
  portalId: string;
  status: Extract<PortalState, "OPEN" | "CLOSED">;
}): Promise<AdminPortal> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const current = await getPortalForAdmin(input.adminId, input.portalId);

    if (!current) {
      throw new PortalServiceError("PORTAL_NOT_FOUND");
    }

    if (isExpired(current)) {
      await expirePortalRecord(current.id);
      throw new PortalServiceError("PORTAL_EXPIRED");
    }

    if (current.status === input.status) {
      return toAdminPortal(current);
    }

    if (
      input.status === "OPEN" &&
      (current.connectionStatus !== "ACTIVE" || current.destinationStatus !== "ACTIVE")
    ) {
      throw new PortalServiceError("DESTINATION_UNAVAILABLE");
    }

    try {
      assertPortalTransition(current.status, input.status);
    } catch (error) {
      if (error instanceof PortalStateTransitionError) {
        throw new PortalServiceError("PORTAL_STATE_CONFLICT");
      }

      throw error;
    }

    const result = await transitionPortalRecordForAdmin({
      actorId: input.adminId,
      portalId: input.portalId,
      expectedStatus: current.status,
      status: input.status,
    });

    if (result.kind === "portal_already_open") {
      throw new PortalServiceError("PORTAL_ALREADY_OPEN");
    }

    if (result.kind === "updated") {
      return toAdminPortal({
        ...current,
        ...result.portal,
      });
    }
  }

  throw new PortalServiceError("PORTAL_STATE_CONFLICT");
}
