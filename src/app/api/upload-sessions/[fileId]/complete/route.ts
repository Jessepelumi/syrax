import type { NextRequest } from "next/server";
import { z } from "zod";

import { knownUploadErrorResponse } from "@/app/api/upload-sessions/upload-response";
import { errorResponse } from "@/lib/errors";
import { newId } from "@/lib/ids";
import { getLogger } from "@/lib/logger";
import { hasJsonContentType, readJsonBody } from "@/lib/request-body";
import { hasExpectedOrigin } from "@/server/auth/request-security";
import { completeUpload } from "@/server/uploads/upload-service";

export const runtime = "nodejs";

const completionRequestSchema = z
  .object({
    clientFileId: z.string().trim().min(1).max(128),
    portalToken: z.string().min(1).max(128),
    providerFileId: z.string().trim().min(1).max(512).optional(),
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

  const parsedBody = completionRequestSchema.safeParse(body);

  if (!parsedBody.success || !fileId || fileId.length > 128) {
    return errorResponse({
      code: "INVALID_REQUEST",
      message: "Upload completion request is invalid.",
      requestId,
      status: 400,
    });
  }

  try {
    const result = await completeUpload({
      ...parsedBody.data,
      fileId,
    });

    getLogger().info({
      event: "upload.completed",
      requestId,
      submissionId: parsedBody.data.submissionId,
      fileId,
      confirmedBytes: result.bytesConfirmed,
      provider: "google_drive",
    });

    return Response.json(result, {
      headers: { "Cache-Control": "no-store", "X-Request-Id": requestId },
    });
  } catch (error) {
    const knownResponse = knownUploadErrorResponse(error, requestId);

    if (knownResponse) {
      return knownResponse;
    }

    getLogger().error({
      event: "upload.completion.failed",
      requestId,
      submissionId: parsedBody.data.submissionId,
      fileId,
      errorType: error instanceof Error ? error.name : "UnknownError",
    });

    return errorResponse({
      code: "INTERNAL_ERROR",
      message: "Upload completion could not be verified.",
      requestId,
      retryable: true,
      status: 500,
    });
  }
}
