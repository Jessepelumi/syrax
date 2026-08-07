import "server-only";

import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import type { NextRequest, NextResponse } from "next/server";

import { getEnvironment } from "@/lib/env";

const ADMIN_SESSION_COOKIE = "syrax_admin_session";
const ADMIN_SESSION_ISSUER = "syrax-intake";
const ADMIN_SESSION_AUDIENCE = "syrax-intake-admin";
const ADMIN_SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;

export interface AdminSession {
  adminId: string;
  email: string;
}

function getSessionKey(): Uint8Array {
  return new TextEncoder().encode(getEnvironment().ADMIN_SESSION_SECRET);
}

export async function createAdminSessionToken(session: AdminSession): Promise<string> {
  return new SignJWT({ email: session.email })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(session.adminId)
    .setIssuer(ADMIN_SESSION_ISSUER)
    .setAudience(ADMIN_SESSION_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${ADMIN_SESSION_MAX_AGE_SECONDS}s`)
    .sign(getSessionKey());
}

async function verifyAdminSessionToken(token: string | undefined): Promise<AdminSession | null> {
  if (!token) {
    return null;
  }

  try {
    const { payload } = await jwtVerify(token, getSessionKey(), {
      algorithms: ["HS256"],
      audience: ADMIN_SESSION_AUDIENCE,
      issuer: ADMIN_SESSION_ISSUER,
    });

    if (!payload.sub || typeof payload.email !== "string") {
      return null;
    }

    return { adminId: payload.sub, email: payload.email };
  } catch {
    return null;
  }
}

export async function getAdminSession(): Promise<AdminSession | null> {
  const cookieStore = await cookies();
  return verifyAdminSessionToken(cookieStore.get(ADMIN_SESSION_COOKIE)?.value);
}

export async function getAdminSessionFromRequest(request: NextRequest): Promise<AdminSession | null> {
  return verifyAdminSessionToken(request.cookies.get(ADMIN_SESSION_COOKIE)?.value);
}

export function setAdminSessionCookie(response: NextResponse, token: string): void {
  response.cookies.set({
    name: ADMIN_SESSION_COOKIE,
    value: token,
    httpOnly: true,
    maxAge: ADMIN_SESSION_MAX_AGE_SECONDS,
    path: "/",
    sameSite: "lax",
    secure: getEnvironment().NODE_ENV === "production",
  });
}
