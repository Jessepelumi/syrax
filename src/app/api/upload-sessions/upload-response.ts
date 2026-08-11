import { errorResponse } from "@/lib/errors";
import { PortalServiceError } from "@/server/portals/portal-service";
import { UploadServiceError } from "@/server/uploads/upload-service";

export function knownUploadErrorResponse(
  error: unknown,
  requestId: string,
): Response | null {
  if (error instanceof PortalServiceError) {
    const mapped: Record<
      PortalServiceError["code"],
      { message: string; retryable?: boolean; status: number }
    > = {
      DESTINATION_UNAVAILABLE: {
        message: "Uploads are temporarily unavailable. Contact the person who shared this link.",
        retryable: true,
        status: 503,
      },
      PORTAL_ALREADY_OPEN: { message: "Upload portal conflict.", status: 409 },
      PORTAL_CLOSED: { message: "This upload link is closed.", status: 409 },
      PORTAL_EXPIRED: { message: "This upload link has expired.", status: 410 },
      PORTAL_INVALID: { message: "This upload link is invalid.", status: 400 },
      PORTAL_NOT_EDITABLE: { message: "Upload portal conflict.", status: 409 },
      PORTAL_NOT_DELETABLE: { message: "Upload portal conflict.", status: 409 },
      PORTAL_NOT_FOUND: { message: "This upload link is invalid.", status: 404 },
      PORTAL_STATE_CONFLICT: {
        message: "Portal status changed. Try again.",
        retryable: true,
        status: 409,
      },
    };

    return errorResponse({ code: error.code, requestId, ...mapped[error.code] });
  }

  if (error instanceof UploadServiceError) {
    const mapped: Record<
      UploadServiceError["code"],
      { message: string; retryable?: boolean; status: number }
    > = {
      DESTINATION_UNAVAILABLE: {
        message: "Uploads are temporarily unavailable. Contact the person who shared this link.",
        retryable: true,
        status: 503,
      },
      FILE_NOT_FOUND: { message: "Upload file was not found.", status: 404 },
      PROVIDER_RATE_LIMITED: {
        message: "Google Drive is busy. Try again shortly.",
        retryable: true,
        status: 429,
      },
      PROVIDER_TRANSIENT_ERROR: {
        message: "Google Drive is temporarily unavailable. Try again.",
        retryable: true,
        status: 503,
      },
      UPLOAD_SESSION_BUSY: {
        message: "Upload session is being prepared. Try again.",
        retryable: true,
        status: 409,
      },
      UPLOAD_SESSION_EXPIRED: {
        message: "The upload session expired. Select the file again.",
        status: 410,
      },
      UPLOAD_STATE_CONFLICT: {
        message: "Upload state changed. Check status and try again.",
        retryable: true,
        status: 409,
      },
      UPLOAD_VERIFICATION_FAILED: {
        message: "Google Drive has not confirmed the completed file.",
        retryable: true,
        status: 502,
      },
    };

    return errorResponse({ code: error.code, requestId, ...mapped[error.code] });
  }

  return null;
}
