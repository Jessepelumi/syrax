export type ErrorCode =
  | "ADMIN_UNAUTHORIZED"
  | "DUPLICATE_CLIENT_FILE_ID"
  | "DESTINATION_INVALID"
  | "DESTINATION_NOT_FOLDER"
  | "DESTINATION_NOT_WRITABLE"
  | "DESTINATION_TRASHED"
  | "DESTINATION_UNAVAILABLE"
  | "DRIVE_NOT_CONNECTED"
  | "FILE_COUNT_INVALID"
  | "FILE_METADATA_INVALID"
  | "FILE_NOT_FOUND"
  | "FILE_TOO_LARGE"
  | "FILE_TYPE_NOT_ALLOWED"
  | "INTERNAL_ERROR"
  | "INVALID_REQUEST"
  | "OAUTH_FAILED"
  | "PORTAL_ALREADY_OPEN"
  | "PORTAL_CLOSED"
  | "PORTAL_EXPIRED"
  | "PORTAL_INVALID"
  | "PORTAL_NOT_CLOSED"
  | "PORTAL_NOT_FOUND"
  | "PORTAL_STATE_CONFLICT"
  | "PROVIDER_RATE_LIMITED"
  | "PROVIDER_TRANSIENT_ERROR"
  | "SUBMISSION_TOO_LARGE"
  | "UPLOAD_SESSION_EXPIRED"
  | "UPLOAD_SESSION_BUSY"
  | "UPLOAD_STATE_CONFLICT"
  | "UPLOAD_VERIFICATION_FAILED";

export function errorResponse(options: {
  code: ErrorCode;
  message: string;
  requestId: string;
  retryable?: boolean;
  status: number;
}): Response {
  return Response.json(
    {
      error: {
        code: options.code,
        message: options.message,
        retryable: options.retryable ?? false,
        requestId: options.requestId,
      },
    },
    {
      status: options.status,
      headers: {
        "Cache-Control": "no-store",
        "X-Request-Id": options.requestId,
      },
    },
  );
}
