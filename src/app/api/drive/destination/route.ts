import type { NextRequest } from "next/server";
import { z } from "zod";

import { errorResponse } from "@/lib/errors";
import { newId } from "@/lib/ids";
import { getLogger } from "@/lib/logger";
import { getAdminSessionFromRequest } from "@/server/auth/admin-session";
import { hasExpectedOrigin } from "@/server/auth/request-security";
import { DestinationValidationError } from "@/server/drive/destination";
import { selectDriveDestination } from "@/server/drive/destination-service";

export const runtime = "nodejs";

const destinationRequestSchema = z.object({
  folderId: z.string().trim().min(1).max(512),
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

  const parsedBody = destinationRequestSchema.safeParse(body);

  if (!parsedBody.success) {
    return errorResponse({
      code: "INVALID_REQUEST",
      message: "Select one Google Drive folder.",
      requestId,
      status: 400,
    });
  }

  try {
    const destination = await selectDriveDestination(
      session.adminId,
      parsedBody.data.folderId,
    );
    getLogger().info({
      event: "drive.destination.verified",
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
        headers: { "Cache-Control": "no-store", "X-Request-Id": requestId },
      },
    );
  } catch (error) {
    if (error instanceof DestinationValidationError) {
      const messages: Record<DestinationValidationError["code"], string> = {
        DESTINATION_INVALID: "Google Drive did not return complete folder metadata.",
        DESTINATION_NAME_MISMATCH: "Select the TJWeddingGuestUpload folder.",
        DESTINATION_NOT_FOLDER: "Selected item is not a folder.",
        DESTINATION_NOT_WRITABLE: "Connected account cannot add files to this folder.",
        DESTINATION_TRASHED: "Selected folder is in trash.",
      };

      return errorResponse({
        code: error.code,
        message: messages[error.code],
        requestId,
        status: 400,
      });
    }

    getLogger().error({
      event: "drive.destination.failed",
      requestId,
      adminId: session.adminId,
      errorType: error instanceof Error ? error.name : "UnknownError",
    });

    return errorResponse({
      code: "DRIVE_NOT_CONNECTED",
      message: "Google Drive destination could not be verified.",
      requestId,
      retryable: true,
      status: 502,
    });
  }
}
