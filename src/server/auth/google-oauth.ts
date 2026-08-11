import "server-only";

import { google } from "googleapis";

import { getEnvironment } from "@/lib/env";
import { saveGoogleConnection } from "@/server/auth/auth-repository";
import { createTokenVault } from "@/server/auth/token-vault";

export const GOOGLE_DRIVE_FILE_SCOPE = "https://www.googleapis.com/auth/drive.file";

export const GOOGLE_OAUTH_SCOPES = [
  GOOGLE_DRIVE_FILE_SCOPE,
  "openid",
  "email",
  "profile",
] as const;

export class GoogleOAuthError extends Error {
  constructor(public readonly reason: string) {
    super("Google authorization failed");
    this.name = "GoogleOAuthError";
  }
}

export function createGoogleOAuthClient() {
  const environment = getEnvironment();

  return new google.auth.OAuth2(
    environment.GOOGLE_CLIENT_ID,
    environment.GOOGLE_CLIENT_SECRET,
    environment.GOOGLE_OAUTH_REDIRECT_URI,
  );
}

export function createGoogleAuthorizationUrl(state: string): string {
  return createGoogleOAuthClient().generateAuthUrl({
    access_type: "offline",
    include_granted_scopes: true,
    prompt: "consent select_account",
    scope: [...GOOGLE_OAUTH_SCOPES],
    state,
  });
}

export function isInvitedBetaAdminEmail(
  email: string,
  invitedEmails: readonly string[],
): boolean {
  return invitedEmails.includes(email.trim().toLowerCase());
}

export async function completeGoogleAuthorization(code: string): Promise<{
  adminId: string;
  email: string;
}> {
  const environment = getEnvironment();
  const oauthClient = createGoogleOAuthClient();
  const { tokens } = await oauthClient.getToken(code);

  if (!tokens.id_token) {
    throw new GoogleOAuthError("IDENTITY_TOKEN_MISSING");
  }

  const ticket = await oauthClient.verifyIdToken({
    audience: environment.GOOGLE_CLIENT_ID,
    idToken: tokens.id_token,
  });
  const payload = ticket.getPayload();
  const email = payload?.email?.trim().toLowerCase();

  if (!payload?.sub || !email || payload.email_verified !== true) {
    throw new GoogleOAuthError("IDENTITY_INVALID");
  }

  if (!isInvitedBetaAdminEmail(email, environment.BETA_ADMIN_EMAILS)) {
    throw new GoogleOAuthError("ADMIN_EMAIL_NOT_INVITED");
  }

  const grantedScopes = [...new Set((tokens.scope ?? "").split(/\s+/).filter(Boolean))].sort();

  if (!grantedScopes.includes(GOOGLE_DRIVE_FILE_SCOPE)) {
    throw new GoogleOAuthError("DRIVE_FILE_SCOPE_MISSING");
  }

  const tokenVault = createTokenVault(environment.TOKEN_ENCRYPTION_KEY);
  const connection = await saveGoogleConnection({
    email,
    encryptedRefreshToken: tokens.refresh_token
      ? tokenVault.encrypt(tokens.refresh_token)
      : undefined,
    googleSubject: payload.sub,
    grantedScopes,
    tokenVersion: tokenVault.version,
  });

  return { adminId: connection.adminId, email };
}
