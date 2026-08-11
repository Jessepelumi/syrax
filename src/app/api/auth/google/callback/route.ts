import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { getEnvironment } from "@/lib/env";
import { newId } from "@/lib/ids";
import { getLogger } from "@/lib/logger";
import {
  createAdminSessionToken,
  setAdminSessionCookie,
} from "@/server/auth/admin-session";
import {
  completeGoogleAuthorization,
  GoogleOAuthError,
} from "@/server/auth/google-oauth";
import { matchesOAuthState, OAUTH_STATE_COOKIE } from "@/server/auth/oauth-state";

export const runtime = "nodejs";

function redirectWithError(code: string): NextResponse {
  const url = new URL("/admin", getEnvironment().APP_BASE_URL);
  url.searchParams.set("error", code);
  const response = NextResponse.redirect(url, { status: 303 });
  clearOAuthStateCookie(response);
  response.headers.set("Cache-Control", "no-store");
  return response;
}

function clearOAuthStateCookie(response: NextResponse): void {
  response.cookies.set({
    name: OAUTH_STATE_COOKIE,
    value: "",
    httpOnly: true,
    maxAge: 0,
    path: "/api/auth/google/callback",
    sameSite: "lax",
    secure: getEnvironment().NODE_ENV === "production",
  });
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const requestId = newId("req");
  const searchParams = request.nextUrl.searchParams;

  if (
    !matchesOAuthState(
      request.cookies.get(OAUTH_STATE_COOKIE)?.value,
      searchParams.get("state"),
    )
  ) {
    getLogger().warn({ event: "oauth.callback.rejected", requestId, reason: "STATE_MISMATCH" });
    return redirectWithError("oauth_state_invalid");
  }

  const code = searchParams.get("code");

  if (searchParams.has("error") || !code) {
    getLogger().warn({ event: "oauth.callback.rejected", requestId, reason: "GOOGLE_DENIED" });
    return redirectWithError("oauth_denied");
  }

  try {
    const admin = await completeGoogleAuthorization(code);
    const sessionToken = await createAdminSessionToken({
      adminId: admin.adminId,
      email: admin.email,
    });
    const response = NextResponse.redirect(
      new URL("/admin/destination", getEnvironment().APP_BASE_URL),
      { status: 303 },
    );
    setAdminSessionCookie(response, sessionToken);
    clearOAuthStateCookie(response);
    response.headers.set("Cache-Control", "no-store");

    getLogger().info({ event: "oauth.callback.completed", requestId, adminId: admin.adminId });
    return response;
  } catch (error) {
    if (
      error instanceof GoogleOAuthError &&
      error.reason === "ADMIN_EMAIL_NOT_INVITED"
    ) {
      getLogger().warn({
        event: "oauth.callback.rejected",
        requestId,
        reason: error.reason,
      });
      return redirectWithError("oauth_not_invited");
    }

    getLogger().error({
      event: "oauth.callback.failed",
      requestId,
      errorType: error instanceof Error ? error.name : "UnknownError",
    });
    return redirectWithError("oauth_failed");
  }
}
