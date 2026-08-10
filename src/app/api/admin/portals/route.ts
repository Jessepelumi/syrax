import type { NextRequest } from "next/server";
import { z } from "zod";

import { errorResponse } from "@/lib/errors";
import { getEnvironment } from "@/lib/env";
import { newId } from "@/lib/ids";
import { getLogger } from "@/lib/logger";
import {
  hasJsonContentType,
  readJsonBody,
  RequestBodyError,
} from "@/lib/request-body";
import { getAdminSessionFromRequest } from "@/server/auth/admin-session";
import { hasExpectedOrigin } from "@/server/auth/request-security";
import {
  createPortalForAdmin,
  PortalServiceError,
} from "@/server/portals/portal-service";

export const runtime = "nodejs";

const portalRequestSchema = z
  .object({
    expiresAt: z.iso.datetime({ offset: true }),
    name: z.string().trim().min(1).max(120),
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
  } catch (error) {
    return errorResponse({
      code: "INVALID_REQUEST",
      message:
        error instanceof RequestBodyError && error.code === "REQUEST_TOO_LARGE"
          ? "Request body is too large."
          : "Request body must be valid JSON.",
      requestId,
      status: error instanceof RequestBodyError && error.code === "REQUEST_TOO_LARGE" ? 413 : 400,
    });
  }

  const parsedBody = portalRequestSchema.safeParse(body);

  if (!parsedBody.success) {
    return errorResponse({
      code: "PORTAL_INVALID",
      message: "Enter a portal name and a future expiry time.",
      requestId,
      status: 400,
    });
  }

  try {
    const created = await createPortalForAdmin({
      adminId: session.adminId,
      name: parsedBody.data.name,
      expiresAt: new Date(parsedBody.data.expiresAt),
    });
    const portalUrl = new URL(
      `/upload/${encodeURIComponent(created.publicToken)}`,
      getEnvironment().APP_BASE_URL,
    ).toString();

    getLogger().info({
      event: "portal.created",
      requestId,
      adminId: session.adminId,
      portalId: created.portal.id,
      expiresAt: created.portal.expiresAt.toISOString(),
    });

    return Response.json(
      {
        portal: {
          id: created.portal.id,
          name: created.portal.name,
          status: created.portal.status,
          expiresAt: created.portal.expiresAt.toISOString(),
        },
        portalUrl,
      },
      {
        status: 201,
        headers: {
          "Cache-Control": "private, no-store",
          "Referrer-Policy": "no-referrer",
          "X-Request-Id": requestId,
        },
      },
    );
  } catch (error) {
    if (error instanceof PortalServiceError) {
      if (error.code === "DESTINATION_UNAVAILABLE") {
        return errorResponse({
          code: error.code,
          message: "Select and verify a Google Drive destination first.",
          requestId,
          status: 409,
        });
      }

      if (error.code === "PORTAL_ALREADY_OPEN") {
        return errorResponse({
          code: error.code,
          message: "Close the current portal before creating another.",
          requestId,
          status: 409,
        });
      }

      if (error.code === "PORTAL_INVALID") {
        return errorResponse({
          code: error.code,
          message: "Portal expiry must be in the future.",
          requestId,
          status: 400,
        });
      }
    }

    getLogger().error({
      event: "portal.create_failed",
      requestId,
      adminId: session.adminId,
      errorType: error instanceof Error ? error.name : "UnknownError",
    });

    return errorResponse({
      code: "INTERNAL_ERROR",
      message: "The upload portal could not be created.",
      requestId,
      status: 500,
    });
  }
}
