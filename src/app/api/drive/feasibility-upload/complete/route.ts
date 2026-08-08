import type { NextRequest } from "next/server";
import { z } from "zod";

import { errorResponse } from "@/lib/errors";
import { newId } from "@/lib/ids";
import { getLogger } from "@/lib/logger";
import { getAdminSessionFromRequest } from "@/server/auth/admin-session";
import { hasExpectedOrigin } from "@/server/auth/request-security";
import {
  FEASIBILITY_UPLOAD_ID_PATTERN,
  FeasibilityUploadError,
  verifyFeasibilityUpload,
} from "@/server/drive/resumable-upload";

export const runtime = "nodejs";

const completionRequestSchema = z.object({
  providerFileId: z.string().trim().min(1).max(512).optional(),
  uploadId: z.string().trim().regex(FEASIBILITY_UPLOAD_ID_PATTERN).max(128),
});

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

  const parsedBody = completionRequestSchema.safeParse(body);

  if (!parsedBody.success) {
    return errorResponse({
      code: "INVALID_REQUEST",
      message: "Upload completion data is invalid.",
      requestId,
      status: 400,
    });
  }

  try {
    const verified = await verifyFeasibilityUpload({
      adminId: session.adminId,
      ...parsedBody.data,
    });

    getLogger().info({
      event: "drive.feasibility_upload.completed",
      requestId,
      adminId: session.adminId,
      uploadId: parsedBody.data.uploadId,
      confirmedBytes: verified.sizeBytes,
      provider: "google_drive",
    });

    return Response.json(
      {
        destinationName: verified.destinationName,
        mimeType: verified.mimeType,
        sizeBytes: verified.sizeBytes,
        status: "COMPLETED",
      },
      {
        headers: { "Cache-Control": "no-store", "X-Request-Id": requestId },
      },
    );
  } catch (error) {
    getLogger().error({
      event: "drive.feasibility_upload.verification_failed",
      requestId,
      adminId: session.adminId,
      uploadId: parsedBody.data.uploadId,
      errorType: error instanceof Error ? error.name : "UnknownError",
    });

    return errorResponse({
      code:
        error instanceof FeasibilityUploadError &&
        error.code === "DESTINATION_UNAVAILABLE"
          ? "DESTINATION_UNAVAILABLE"
          : "UPLOAD_VERIFICATION_FAILED",
      message: "Google Drive did not confirm the expected file in the destination.",
      requestId,
      retryable: false,
      status: 502,
    });
  }
}
