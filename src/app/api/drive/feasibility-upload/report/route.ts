import type { NextRequest } from "next/server";
import { z } from "zod";

import { errorResponse } from "@/lib/errors";
import { newId } from "@/lib/ids";
import { getLogger } from "@/lib/logger";
import { getAdminSessionFromRequest } from "@/server/auth/admin-session";
import { hasExpectedOrigin } from "@/server/auth/request-security";
import {
  FEASIBILITY_UPLOAD_ID_PATTERN,
  recordFeasibilityUploadFailure,
} from "@/server/drive/resumable-upload";

export const runtime = "nodejs";

const failureReportSchema = z.object({
  code: z.enum([
    "NETWORK_OR_CORS",
    "PROVIDER_RATE_LIMITED",
    "PROVIDER_REJECTED",
    "PROVIDER_RESPONSE_INVALID",
    "PROVIDER_TRANSIENT_ERROR",
    "UPLOAD_SESSION_EXPIRED",
  ]),
  providerStatus: z.number().int().min(100).max(599).optional(),
  stage: z.enum(["provider_upload", "provider_response"]),
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

  const parsedBody = failureReportSchema.safeParse(body);

  if (!parsedBody.success) {
    return errorResponse({
      code: "INVALID_REQUEST",
      message: "Upload failure report is invalid.",
      requestId,
      status: 400,
    });
  }

  try {
    await recordFeasibilityUploadFailure({
      adminId: session.adminId,
      ...parsedBody.data,
    });

    getLogger().warn({
      event: "drive.feasibility_upload.browser_failed",
      requestId,
      adminId: session.adminId,
      ...parsedBody.data,
      provider: "google_drive",
    });

    return new Response(null, {
      status: 204,
      headers: { "Cache-Control": "no-store", "X-Request-Id": requestId },
    });
  } catch (error) {
    getLogger().error({
      event: "drive.feasibility_upload.failure_report_failed",
      requestId,
      adminId: session.adminId,
      errorType: error instanceof Error ? error.name : "UnknownError",
    });

    return errorResponse({
      code: "INTERNAL_ERROR",
      message: "Upload failure could not be recorded.",
      requestId,
      status: 500,
    });
  }
}
