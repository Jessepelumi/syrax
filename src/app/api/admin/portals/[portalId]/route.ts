import type { NextRequest } from "next/server";
import { z } from "zod";

import { errorResponse } from "@/lib/errors";
import { newId } from "@/lib/ids";
import { getLogger } from "@/lib/logger";
import { hasJsonContentType, readJsonBody } from "@/lib/request-body";
import { getAdminSessionFromRequest } from "@/server/auth/admin-session";
import { hasExpectedOrigin } from "@/server/auth/request-security";
import {
  deleteInactivePortalForAdmin,
  PortalServiceError,
  transitionPortalForAdmin,
  updatePortalExpiryForAdmin,
} from "@/server/portals/portal-service";

export const runtime = "nodejs";

const portalUpdateRequestSchema = z.union([
  z.object({ status: z.enum(["OPEN", "CLOSED"]) }).strict(),
  z.object({ expiresAt: z.iso.datetime({ offset: true }) }).strict(),
]);

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ portalId: string }> },
): Promise<Response> {
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

  const { portalId } = await context.params;
  let body: unknown;

  try {
    body = await readJsonBody(request, 1024);
  } catch {
    return errorResponse({
      code: "INVALID_REQUEST",
      message: "Request body must be valid JSON.",
      requestId,
      status: 400,
    });
  }

  const parsedBody = portalUpdateRequestSchema.safeParse(body);

  if (!parsedBody.success || portalId.length > 128) {
    return errorResponse({
      code: "INVALID_REQUEST",
      message: "Portal update request is invalid.",
      requestId,
      status: 400,
    });
  }

  try {
    const portal = "status" in parsedBody.data
      ? await transitionPortalForAdmin({
          adminId: session.adminId,
          portalId,
          status: parsedBody.data.status,
        })
      : await updatePortalExpiryForAdmin({
          adminId: session.adminId,
          expiresAt: new Date(parsedBody.data.expiresAt),
          portalId,
        });

    getLogger().info({
      event: "status" in parsedBody.data
        ? "portal.status_changed"
        : "portal.expiry_changed",
      requestId,
      adminId: session.adminId,
      portalId,
      status: portal.status,
      expiresAt: portal.expiresAt.toISOString(),
    });

    return Response.json(
      {
        portal: {
          id: portal.id,
          name: portal.name,
          status: portal.status,
          expiresAt: portal.expiresAt.toISOString(),
          portalUrl: portal.portalUrl,
        },
      },
      {
        headers: { "Cache-Control": "private, no-store", "X-Request-Id": requestId },
      },
    );
  } catch (error) {
    if (error instanceof PortalServiceError) {
      const responses: Record<
        | "DESTINATION_UNAVAILABLE"
        | "PORTAL_ALREADY_OPEN"
        | "PORTAL_EXPIRED"
        | "PORTAL_INVALID"
        | "PORTAL_NOT_EDITABLE"
        | "PORTAL_NOT_FOUND"
        | "PORTAL_STATE_CONFLICT",
        { message: string; status: number }
      > = {
        DESTINATION_UNAVAILABLE: {
          message: "Reconnect and verify the Drive destination before reopening.",
          status: 409,
        },
        PORTAL_ALREADY_OPEN: {
          message: "Close the current portal before reopening this one.",
          status: 409,
        },
        PORTAL_EXPIRED: { message: "This portal has expired.", status: 410 },
        PORTAL_INVALID: {
          message: "Choose a valid expiry time in the future.",
          status: 400,
        },
        PORTAL_NOT_EDITABLE: {
          message: "This portal's expiry can no longer be edited.",
          status: 409,
        },
        PORTAL_NOT_FOUND: { message: "Portal was not found.", status: 404 },
        PORTAL_STATE_CONFLICT: {
          message: "Portal status changed. Refresh and try again.",
          status: 409,
        },
      };

      if (error.code in responses) {
        const code = error.code as keyof typeof responses;
        return errorResponse({ code, requestId, ...responses[code] });
      }
    }

    getLogger().error({
      event: "portal.update_failed",
      requestId,
      adminId: session.adminId,
      portalId,
      errorType: error instanceof Error ? error.name : "UnknownError",
    });

    return errorResponse({
      code: "INTERNAL_ERROR",
      message: "Portal could not be updated.",
      requestId,
      status: 500,
    });
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ portalId: string }> },
): Promise<Response> {
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

  const { portalId } = await context.params;

  if (!portalId || portalId.length > 128) {
    return errorResponse({
      code: "INVALID_REQUEST",
      message: "Portal deletion request is invalid.",
      requestId,
      status: 400,
    });
  }

  try {
    await deleteInactivePortalForAdmin({ adminId: session.adminId, portalId });

    getLogger().info({
      event: "portal.deleted",
      requestId,
      adminId: session.adminId,
      portalId,
    });

    return new Response(null, {
      status: 204,
      headers: {
        "Cache-Control": "private, no-store",
        "X-Request-Id": requestId,
      },
    });
  } catch (error) {
    if (error instanceof PortalServiceError) {
      if (error.code === "PORTAL_NOT_FOUND") {
        return errorResponse({
          code: error.code,
          message: "Portal was not found.",
          requestId,
          status: 404,
        });
      }

      if (error.code === "PORTAL_NOT_DELETABLE") {
        return errorResponse({
          code: error.code,
          message: "Only closed or expired portals can be deleted.",
          requestId,
          status: 409,
        });
      }
    }

    getLogger().error({
      event: "portal.delete_failed",
      requestId,
      adminId: session.adminId,
      portalId,
      errorType: error instanceof Error ? error.name : "UnknownError",
    });

    return errorResponse({
      code: "INTERNAL_ERROR",
      message: "Portal could not be deleted.",
      requestId,
      status: 500,
    });
  }
}
