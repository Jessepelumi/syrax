import { NextResponse } from "next/server";

import { getEnvironment } from "@/lib/env";
import { createGoogleAuthorizationUrl } from "@/server/auth/google-oauth";
import {
  createOAuthState,
  OAUTH_STATE_COOKIE,
  OAUTH_STATE_MAX_AGE_SECONDS,
} from "@/server/auth/oauth-state";

export const runtime = "nodejs";

export function GET(): NextResponse {
  const state = createOAuthState();
  const response = NextResponse.redirect(createGoogleAuthorizationUrl(state));

  response.cookies.set({
    name: OAUTH_STATE_COOKIE,
    value: state,
    httpOnly: true,
    maxAge: OAUTH_STATE_MAX_AGE_SECONDS,
    path: "/api/auth/google/callback",
    sameSite: "lax",
    secure: getEnvironment().NODE_ENV === "production",
  });
  response.headers.set("Cache-Control", "no-store");

  return response;
}
