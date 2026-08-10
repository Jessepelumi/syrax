import type { NextRequest } from "next/server";
import { z } from "zod";

import { errorResponse } from "@/lib/errors";
import { newId } from "@/lib/ids";
import { getLogger } from "@/lib/logger";
import {
  hasJsonContentType,
  readJsonBody,
  RequestBodyError,
} from "@/lib/request-body";
import { hasExpectedOrigin } from "@/server/auth/request-security";
import { createOrGetUploadSession } from "@/server/uploads/upload-service";
import { knownUploadErrorResponse } from "@/app/api/upload-sessions/upload-response";

export const runtime = "nodejs";

const uploadSessionRequestSchema = z
  .object({
    clientFileId: z.string().trim().min(1).max(128),
    fileId: z.string().trim().min(1).max(128),
    portalToken: z.string().min(1).max(128),
    submissionId: z.string().trim().min(1).max(128),
  })
  .strict();

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
    body = await readJsonBody(request, 8 * 1024);
  } catch (error) {
    const tooLarge = error instanceof RequestBodyError && error.code === "REQUEST_TOO_LARGE";
    return errorResponse({
      code: "INVALID_REQUEST",
      message: tooLarge ? "Request body is too large." : "Request body must be valid JSON.",
      requestId,
      status: tooLarge ? 413 : 400,
    });
  }

  const parsedBody = uploadSessionRequestSchema.safeParse(body);

  if (!parsedBody.success) {
    return errorResponse({
      code: "INVALID_REQUEST",
      message: "Upload session request is invalid.",
      requestId,
      status: 400,
    });
  }

  try {
    const session = await createOrGetUploadSession(parsedBody.data);

    getLogger().info({
      event: "upload.session.created_or_resolved",
      requestId,
      submissionId: parsedBody.data.submissionId,
      fileId: parsedBody.data.fileId,
      state: session.state,
      bytesConfirmed: session.bytesConfirmed,
      provider: "google_drive",
    });

    return Response.json(session, {
      headers: {
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
        "X-Request-Id": requestId,
      },
    });
  } catch (error) {
    const knownResponse = knownUploadErrorResponse(error, requestId);

    if (knownResponse) {
      return knownResponse;
    }

    getLogger().error({
      event: "upload.session.failed",
      requestId,
      submissionId: parsedBody.data.submissionId,
      fileId: parsedBody.data.fileId,
      errorType: error instanceof Error ? error.name : "UnknownError",
    });

    return errorResponse({
      code: "INTERNAL_ERROR",
      message: "The upload session could not be prepared.",
      requestId,
      retryable: true,
      status: 500,
    });
  }
}
