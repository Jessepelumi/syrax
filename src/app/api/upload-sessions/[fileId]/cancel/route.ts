import type { NextRequest } from "next/server";
import { z } from "zod";

import { knownUploadErrorResponse } from "@/app/api/upload-sessions/upload-response";
import { errorResponse } from "@/lib/errors";
import { newId } from "@/lib/ids";
import { hasJsonContentType, readJsonBody } from "@/lib/request-body";
import { hasExpectedOrigin } from "@/server/auth/request-security";
import { cancelUpload } from "@/server/uploads/upload-service";

export const runtime = "nodejs";

const cancelRequestSchema = z
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

  const parsedBody = cancelRequestSchema.safeParse(body);

  if (!parsedBody.success || !fileId || fileId.length > 128) {
    return errorResponse({
      code: "INVALID_REQUEST",
      message: "Upload cancellation request is invalid.",
      requestId,
      status: 400,
    });
  }

  try {
    const result = await cancelUpload({ ...parsedBody.data, fileId });

    return Response.json(result, {
      headers: { "Cache-Control": "no-store", "X-Request-Id": requestId },
    });
  } catch (error) {
    return (
      knownUploadErrorResponse(error, requestId) ??
      errorResponse({
        code: "INTERNAL_ERROR",
        message: "Upload could not be cancelled.",
        requestId,
        status: 500,
      })
    );
  }
}
