import { errorResponse } from "@/lib/errors";
import type { DestinationValidationError } from "@/server/drive/destination";

export function destinationValidationResponse(
  error: DestinationValidationError,
  requestId: string,
): Response {
  const messages: Record<DestinationValidationError["code"], string> = {
    DESTINATION_INVALID: "Google Drive did not return complete folder metadata.",
    DESTINATION_NOT_FOLDER: "Selected item is not a folder.",
    DESTINATION_NOT_WRITABLE: "Connected account cannot add files to this folder.",
    DESTINATION_TRASHED: "Selected folder is in trash.",
  };

  return errorResponse({
    code: error.code,
    message: messages[error.code],
    requestId,
    status: 400,
  });
}
