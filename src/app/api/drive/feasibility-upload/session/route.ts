import type { NextRequest } from "next/server";
import { z } from "zod";

import { errorResponse, type ErrorCode } from "@/lib/errors";
import { newId } from "@/lib/ids";
import { getLogger } from "@/lib/logger";
import { getAdminSessionFromRequest } from "@/server/auth/admin-session";
import { hasExpectedOrigin } from "@/server/auth/request-security";
import {
  createFeasibilityUploadSession,
  FEASIBILITY_IMAGE_TYPES,
  FeasibilityUploadError,
  getFeasibilityUploadLimitBytes,
} from "@/server/drive/resumable-upload";

export const runtime = "nodejs";

const sessionRequestSchema = z.object({
  mimeType: z.enum(FEASIBILITY_IMAGE_TYPES),
  sizeBytes: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
});

function mappedError(error: FeasibilityUploadError): {
  code: ErrorCode;
  message: string;
  retryable: boolean;
  status: number;
} {
  switch (error.code) {
    case "DESTINATION_UNAVAILABLE":
      return {
        code: "DESTINATION_UNAVAILABLE",
        message: "Select and verify the Drive destination first.",
        retryable: false,
        status: 409,
      };
    case "PROVIDER_RATE_LIMITED":
      return {
        code: "PROVIDER_RATE_LIMITED",
        message: "Google Drive is rate limiting requests. Try again shortly.",
        retryable: true,
        status: 429,
      };
    case "PROVIDER_TRANSIENT_ERROR":
      return {
        code: "PROVIDER_TRANSIENT_ERROR",
        message: "Google Drive is temporarily unavailable. Try again.",
        retryable: true,
        status: 503,
      };
    default:
      return {
        code: "UPLOAD_VERIFICATION_FAILED",
        message: "Google Drive did not create a valid upload session.",
        retryable: true,
        status: 502,
      };
  }
}

export async function POST(request: NextRequest): Promise<Response> {
  const requestId = newId("req");
  const session = await getAdminSessionFromRequest(request);

  if (!session) {
    return errorResponse({
      code: "ADMIN_UNAUTHORIZED",
      message: "Connect the configured Google account first.",
      requestId,
      status: 401,
    });
  }

  if (!hasExpectedOrigin(request)) {
    return errorResponse({
      code: "INVALID_REQUEST",
      message: "Request origin is not allowed.",
      requestId,
      status: 403,
    });
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return errorResponse({
      code: "INVALID_REQUEST",
      message: "Request body must be valid JSON.",
      requestId,
      status: 400,
    });
  }

  const parsedBody = sessionRequestSchema.safeParse(body);

  if (!parsedBody.success) {
    return errorResponse({
      code: "FILE_TYPE_NOT_ALLOWED",
      message: "Choose one JPEG, PNG, or HEIC image.",
      requestId,
      status: 400,
    });
  }

  if (parsedBody.data.sizeBytes > getFeasibilityUploadLimitBytes()) {
    return errorResponse({
      code: "FILE_TOO_LARGE",
      message: "The image exceeds the configured file-size limit.",
      requestId,
      status: 400,
    });
  }

  try {
    const upload = await createFeasibilityUploadSession({
      adminId: session.adminId,
      ...parsedBody.data,
    });

    getLogger().info({
      event: "drive.feasibility_upload.session_created",
      requestId,
      adminId: session.adminId,
      uploadId: upload.uploadId,
      declaredBytes: parsedBody.data.sizeBytes,
      declaredMimeType: parsedBody.data.mimeType,
      provider: "google_drive",
    });

    return Response.json(upload, {
      headers: {
        "Cache-Control": "private, no-store",
        "Referrer-Policy": "no-referrer",
        "X-Request-Id": requestId,
      },
    });
  } catch (error) {
    getLogger().error({
      event: "drive.feasibility_upload.session_failed",
      requestId,
      adminId: session.adminId,
      errorType: error instanceof Error ? error.name : "UnknownError",
      providerStatus:
        error instanceof FeasibilityUploadError ? error.providerStatus : undefined,
    });

    if (error instanceof FeasibilityUploadError) {
      return errorResponse({ requestId, ...mappedError(error) });
    }

    return errorResponse({
      code: "INTERNAL_ERROR",
      message: "The upload session could not be created.",
      requestId,
      retryable: true,
      status: 500,
    });
  }
}
