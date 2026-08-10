import type { NextRequest } from "next/server";
import { z } from "zod";

import { destinationValidationResponse } from "@/app/api/drive/destination/destination-response";
import { errorResponse } from "@/lib/errors";
import { newId } from "@/lib/ids";
import { getLogger } from "@/lib/logger";
import { hasJsonContentType, readJsonBody } from "@/lib/request-body";
import { getAdminSessionFromRequest } from "@/server/auth/admin-session";
import { hasExpectedOrigin } from "@/server/auth/request-security";
import { DestinationValidationError } from "@/server/drive/destination";
import { createDriveDestination } from "@/server/drive/destination-service";

export const runtime = "nodejs";

const createDestinationRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(255),
  })
  .strict();

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
  } catch {
    return errorResponse({
      code: "INVALID_REQUEST",
      message: "Request body must be valid JSON.",
      requestId,
      status: 400,
    });
  }

  const parsedBody = createDestinationRequestSchema.safeParse(body);

  if (!parsedBody.success) {
    return errorResponse({
      code: "INVALID_REQUEST",
      message: "Enter a valid folder name.",
      requestId,
      status: 400,
    });
  }

  try {
    const destination = await createDriveDestination(
      session.adminId,
      parsedBody.data.name,
    );

    getLogger().info({
      event: "drive.destination.created",
      requestId,
      adminId: session.adminId,
      destinationId: destination.id,
    });

    return Response.json(
      {
        displayName: destination.displayName,
        status: destination.status,
        verifiedAt: destination.verifiedAt.toISOString(),
      },
      {
        status: 201,
        headers: { "Cache-Control": "no-store", "X-Request-Id": requestId },
      },
    );
  } catch (error) {
    if (error instanceof DestinationValidationError) {
      return destinationValidationResponse(error, requestId);
    }

    getLogger().error({
      event: "drive.destination.create_failed",
      requestId,
      adminId: session.adminId,
      errorType: error instanceof Error ? error.name : "UnknownError",
    });

    return errorResponse({
      code: "DRIVE_NOT_CONNECTED",
      message: "Google Drive folder could not be created.",
      requestId,
      retryable: true,
      status: 502,
    });
  }
}
