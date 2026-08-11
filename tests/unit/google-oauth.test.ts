import { describe, expect, it, vi } from "vitest";

const environment = vi.hoisted(() => ({
  GOOGLE_CLIENT_ID: "google-client-id",
  GOOGLE_CLIENT_SECRET: "google-client-secret",
  GOOGLE_OAUTH_REDIRECT_URI: "https://syrax.example/api/auth/google/callback",
}));

vi.mock("@/lib/env", () => ({
  getEnvironment: () => environment,
}));

import {
  createGoogleAuthorizationUrl,
  GOOGLE_DRIVE_FILE_SCOPE,
  GOOGLE_OAUTH_SCOPES,
  isInvitedBetaAdminEmail,
} from "@/server/auth/google-oauth";

describe("Google OAuth scopes", () => {
  it("requests drive.file as the only Drive content scope", () => {
    const driveScopes = GOOGLE_OAUTH_SCOPES.filter((scope) =>
      scope.startsWith("https://www.googleapis.com/auth/drive"),
    );

    expect(driveScopes).toEqual([GOOGLE_DRIVE_FILE_SCOPE]);
    expect(GOOGLE_OAUTH_SCOPES).toEqual([
      GOOGLE_DRIVE_FILE_SCOPE,
      "openid",
      "email",
      "profile",
    ]);
  });

  it("allows any normalized email explicitly present in the beta allowlist", () => {
    const invitedEmails = ["owner@example.com", "invited@example.com"];

    expect(isInvitedBetaAdminEmail(" Invited@Example.com ", invitedEmails)).toBe(true);
    expect(isInvitedBetaAdminEmail("stranger@example.com", invitedEmails)).toBe(false);
  });

  it("lets Google present account selection without forcing one login hint", () => {
    const authorizationUrl = new URL(createGoogleAuthorizationUrl("oauth-state"));

    expect(authorizationUrl.searchParams.get("prompt")).toBe("consent select_account");
    expect(authorizationUrl.searchParams.has("login_hint")).toBe(false);
  });
});
