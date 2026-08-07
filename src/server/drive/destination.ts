export const GOOGLE_DRIVE_FOLDER_MIME_TYPE = "application/vnd.google-apps.folder";

export type DestinationValidationCode =
  | "DESTINATION_INVALID"
  | "DESTINATION_NAME_MISMATCH"
  | "DESTINATION_NOT_FOLDER"
  | "DESTINATION_NOT_WRITABLE"
  | "DESTINATION_TRASHED";

export class DestinationValidationError extends Error {
  constructor(public readonly code: DestinationValidationCode) {
    super("Selected Google Drive destination is invalid");
    this.name = "DestinationValidationError";
  }
}

interface DriveFolderMetadata {
  capabilities?: {
    canAddChildren?: boolean | null;
  } | null;
  id?: string | null;
  mimeType?: string | null;
  name?: string | null;
  trashed?: boolean | null;
}

export function validateDriveDestination(
  metadata: DriveFolderMetadata,
  expectedName: string,
): { id: string; name: string } {
  if (!metadata.id || !metadata.name) {
    throw new DestinationValidationError("DESTINATION_INVALID");
  }

  if (metadata.mimeType !== GOOGLE_DRIVE_FOLDER_MIME_TYPE) {
    throw new DestinationValidationError("DESTINATION_NOT_FOLDER");
  }

  if (metadata.trashed === true) {
    throw new DestinationValidationError("DESTINATION_TRASHED");
  }

  if (metadata.capabilities?.canAddChildren !== true) {
    throw new DestinationValidationError("DESTINATION_NOT_WRITABLE");
  }

  if (metadata.name !== expectedName) {
    throw new DestinationValidationError("DESTINATION_NAME_MISMATCH");
  }

  return { id: metadata.id, name: metadata.name };
}
