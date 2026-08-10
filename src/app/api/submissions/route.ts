import type { NextRequest } from "next/server";
import { z } from "zod";

import { errorResponse, type ErrorCode } from "@/lib/errors";
import { newId } from "@/lib/ids";
import { getLogger } from "@/lib/logger";
import { PILOT_ALLOWED_MIME_TYPES } from "@/lib/mime";
import {
  hasJsonContentType,
  readJsonBody,
  RequestBodyError,
} from "@/lib/request-body";
import { hasExpectedOrigin } from "@/server/auth/request-security";
import { PortalPolicyError } from "@/server/portals/portal-policy";
import { PortalServiceError } from "@/server/portals/portal-service";
import { createSubmission } from "@/server/submissions/submission-service";

export const runtime = "nodejs";

const submissionRequestSchema = z
  .object({
    portalToken: z.string().min(1).max(128),
    guestName: z.string().trim().min(1).max(100).optional(),
    files: z
      .array(
        z
          .object({
            clientFileId: z.string().trim().min(1).max(128),
            name: z.string().trim().min(1).max(255),
            mimeType: z.enum(PILOT_ALLOWED_MIME_TYPES),
            sizeBytes: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
          })
          .strict(),
      )
      .min(1)
      .max(100),
  })
  .strict();

function portalErrorResponse(error: PortalServiceError, requestId: string): Response {
  const mapped: Record<PortalServiceError["code"], { message: string; status: number }> = {
    DESTINATION_UNAVAILABLE: {
      message: "Uploads are temporarily unavailable. Contact the host.",
      status: 503,
    },
    PORTAL_ALREADY_OPEN: { message: "Upload portal conflict.", status: 409 },
    PORTAL_CLOSED: { message: "This upload link is closed.", status: 409 },
    PORTAL_EXPIRED: { message: "This upload link has expired.", status: 410 },
    PORTAL_INVALID: { message: "This upload link is invalid.", status: 400 },
    PORTAL_NOT_CLOSED: { message: "Upload portal conflict.", status: 409 },
    PORTAL_NOT_FOUND: { message: "This upload link is invalid.", status: 404 },
    PORTAL_STATE_CONFLICT: {
      message: "Portal status changed. Try again.",
      status: 409,
    },
  };
  const response = mapped[error.code];

  return errorResponse({ code: error.code, requestId, ...response });
}

function policyErrorResponse(error: PortalPolicyError, requestId: string): Response {
  const mapped: Record<
    PortalPolicyError["code"],
    { code: ErrorCode; message: string }
  > = {
    DUPLICATE_CLIENT_FILE_ID: {
      code: "DUPLICATE_CLIENT_FILE_ID",
      message: "The same file was included more than once.",
    },
    FILE_COUNT_INVALID: {
      code: "FILE_COUNT_INVALID",
      message: "Select a valid number of files.",
    },
    FILE_METADATA_INVALID: {
      code: "FILE_METADATA_INVALID",
      message: "One or more files have invalid metadata.",
    },
    FILE_TOO_LARGE: {
      code: "FILE_TOO_LARGE",
      message: "One or more files exceed the portal file-size limit.",
    },
    FILE_TYPE_NOT_ALLOWED: {
      code: "FILE_TYPE_NOT_ALLOWED",
      message: "One or more file types are not allowed.",
    },
    SUBMISSION_TOO_LARGE: {
      code: "SUBMISSION_TOO_LARGE",
      message: "The selected files exceed the submission-size limit.",
    },
  };

  return errorResponse({
    ...mapped[error.code],
    requestId,
    status: 400,
  });
}

export async function POST(request: NextRequest): Promise<Response> {
  const requestId = newId("req");

  if (!hasExpectedOrigin(request)) {
    return errorResponse({
      code: "INVALID_REQUEST",
      message: "Request origin is not allowed.",
      requestId,
      status: 403,
    });
  }

  if (!hasJsonContentType(request)) {
    return errorResponse({
      code: "INVALID_REQUEST",
      message: "Content-Type must be application/json.",
      requestId,
      status: 415,
    });
  }

  let body: unknown;

  try {
    body = await readJsonBody(request, 64 * 1024);
  } catch (error) {
    const tooLarge = error instanceof RequestBodyError && error.code === "REQUEST_TOO_LARGE";
    return errorResponse({
      code: "INVALID_REQUEST",
      message: tooLarge ? "Request body is too large." : "Request body must be valid JSON.",
      requestId,
      status: tooLarge ? 413 : 400,
    });
  }

  const parsedBody = submissionRequestSchema.safeParse(body);

  if (!parsedBody.success) {
    return errorResponse({
      code: "FILE_METADATA_INVALID",
      message: "Submission metadata is invalid.",
      requestId,
      status: 400,
    });
  }

  try {
    const created = await createSubmission(parsedBody.data);

    getLogger().info({
      event: "submission.created",
      requestId,
      submissionId: created.submissionId,
      fileCount: created.files.length,
    });

    return Response.json(created, {
      status: 201,
      headers: {
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
        "X-Request-Id": requestId,
      },
    });
  } catch (error) {
    if (error instanceof PortalServiceError) {
      return portalErrorResponse(error, requestId);
    }

    if (error instanceof PortalPolicyError) {
      return policyErrorResponse(error, requestId);
    }

    getLogger().error({
      event: "submission.create_failed",
      requestId,
      errorType: error instanceof Error ? error.name : "UnknownError",
    });

    return errorResponse({
      code: "INTERNAL_ERROR",
      message: "The submission could not be created.",
      requestId,
      status: 500,
    });
  }
}
