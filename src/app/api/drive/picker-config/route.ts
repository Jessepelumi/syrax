import type { NextRequest } from "next/server";

import { getEnvironment } from "@/lib/env";
import { errorResponse } from "@/lib/errors";
import { newId } from "@/lib/ids";
import { getAdminSessionFromRequest } from "@/server/auth/admin-session";
import { getAuthorizedGoogleClient } from "@/server/drive/client";

export const runtime = "nodejs";

export async function GET(request: NextRequest): Promise<Response> {
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

  try {
    const authorization = await getAuthorizedGoogleClient(session.adminId);
    const environment = getEnvironment();

    return Response.json(
      {
        accessToken: authorization.accessToken,
        apiKey: environment.GOOGLE_API_KEY,
        appId: environment.GOOGLE_CLOUD_PROJECT_NUMBER,
        expiresAt: authorization.expiresAt,
      },
      {
        headers: {
          "Cache-Control": "private, no-store",
          "Referrer-Policy": "no-referrer",
          "X-Request-Id": requestId,
        },
      },
    );
  } catch {
    return errorResponse({
      code: "DRIVE_NOT_CONNECTED",
      message: "Reconnect Google Drive and try again.",
      requestId,
      status: 401,
    });
  }
}
