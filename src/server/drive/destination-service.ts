import "server-only";

import { getEnvironment } from "@/lib/env";
import { getDriveClient } from "@/server/drive/client";
import { validateDriveDestination } from "@/server/drive/destination";
import { saveDriveDestination } from "@/server/drive/destination-repository";

export async function selectDriveDestination(adminId: string, folderId: string) {
  const { connection, drive } = await getDriveClient(adminId);
  const response = await drive.files.get({
    fileId: folderId,
    fields: "id,name,mimeType,trashed,capabilities(canAddChildren)",
    supportsAllDrives: true,
  });
  const destination = validateDriveDestination(
    response.data,
    getEnvironment().PILOT_DESTINATION_NAME,
  );

  return saveDriveDestination({
    adminId,
    connectionId: connection.id,
    displayName: destination.name,
    providerFolderId: destination.id,
  });
}
