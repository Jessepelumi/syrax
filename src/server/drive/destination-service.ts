import "server-only";

import { normalizeDisplayText } from "@/lib/text";
import { getDriveClient } from "@/server/drive/client";
import {
  GOOGLE_DRIVE_FOLDER_MIME_TYPE,
  DestinationValidationError,
  validateDriveDestination,
} from "@/server/drive/destination";
import { saveDriveDestination } from "@/server/drive/destination-repository";

const DESTINATION_FIELDS = "id,name,mimeType,trashed,capabilities(canAddChildren)";

async function persistVerifiedDestination(input: {
  adminId: string;
  connectionId: string;
  metadata: Parameters<typeof validateDriveDestination>[0];
}) {
  const destination = validateDriveDestination(input.metadata);

  return saveDriveDestination({
    adminId: input.adminId,
    connectionId: input.connectionId,
    displayName: destination.name,
    providerFolderId: destination.id,
  });
}

export async function selectDriveDestination(adminId: string, folderId: string) {
  const { connection, drive } = await getDriveClient(adminId);
  const response = await drive.files.get({
    fileId: folderId,
    fields: DESTINATION_FIELDS,
    supportsAllDrives: true,
  });

  return persistVerifiedDestination({
    adminId,
    connectionId: connection.id,
    metadata: response.data,
  });
}

export async function createDriveDestination(adminId: string, requestedName: string) {
  const name = normalizeDisplayText(requestedName, 255);

  if (!name) {
    throw new DestinationValidationError("DESTINATION_INVALID");
  }

  const { connection, drive } = await getDriveClient(adminId);
  const response = await drive.files.create({
    fields: DESTINATION_FIELDS,
    requestBody: {
      mimeType: GOOGLE_DRIVE_FOLDER_MIME_TYPE,
      name,
    },
    supportsAllDrives: true,
  });

  return persistVerifiedDestination({
    adminId,
    connectionId: connection.id,
    metadata: response.data,
  });
}
