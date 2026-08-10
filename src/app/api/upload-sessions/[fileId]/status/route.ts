import type { NextRequest } from "next/server";
import { z } from "zod";

import { knownUploadErrorResponse } from "@/app/api/upload-sessions/upload-response";
import { errorResponse } from "@/lib/errors";
import { newId } from "@/lib/ids";
import { getLogger } from "@/lib/logger";
import { hasJsonContentType, readJsonBody } from "@/lib/request-body";
import { hasExpectedOrigin } from "@/server/auth/request-security";
import { reconcileUploadStatus } from "@/server/uploads/upload-service";

export const runtime = "nodejs";

const statusRequestSchema = z
  .object({
    clientFileId: z.string().trim().min(1).max(128),
    portalToken: z.string().min(1).max(128),
    submissionId: z.string().trim().min(1).max(128),
  })
  .strict();

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ fileId: string }> },
): Promise<Response> {
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

  const { fileId } = await context.params;
  let body: unknown;

  try {
    body = await readJsonBody(request, 8 * 1024);
  } catch {
    return errorResponse({
      code: "INVALID_REQUEST",
      message: "Request body must be valid JSON.",
      requestId,
      status: 400,
    });
  }

  const parsedBody = statusRequestSchema.safeParse(body);

  if (!parsedBody.success || !fileId || fileId.length > 128) {
    return errorResponse({
      code: "INVALID_REQUEST",
      message: "Upload status request is invalid.",
      requestId,
      status: 400,
    });
  }

  try {
    const status = await reconcileUploadStatus({
      ...parsedBody.data,
      fileId,
    });

    return Response.json(status, {
      headers: { "Cache-Control": "no-store", "X-Request-Id": requestId },
    });
  } catch (error) {
    const knownResponse = knownUploadErrorResponse(error, requestId);

    if (knownResponse) {
      return knownResponse;
    }

    getLogger().error({
      event: "upload.status.failed",
      requestId,
      submissionId: parsedBody.data.submissionId,
      fileId,
      errorType: error instanceof Error ? error.name : "UnknownError",
    });

    return errorResponse({
      code: "INTERNAL_ERROR",
      message: "Upload status could not be checked.",
      requestId,
      retryable: true,
      status: 500,
    });
  }
}
