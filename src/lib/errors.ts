export type ErrorCode =
  | "ADMIN_UNAUTHORIZED"
  | "DESTINATION_INVALID"
  | "DESTINATION_NAME_MISMATCH"
  | "DESTINATION_NOT_FOLDER"
  | "DESTINATION_NOT_WRITABLE"
  | "DESTINATION_TRASHED"
  | "DRIVE_NOT_CONNECTED"
  | "INTERNAL_ERROR"
  | "INVALID_REQUEST"
  | "OAUTH_FAILED";

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
