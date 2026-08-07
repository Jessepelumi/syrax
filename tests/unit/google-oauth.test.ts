import { describe, expect, it } from "vitest";

import {
  GOOGLE_DRIVE_FILE_SCOPE,
  GOOGLE_OAUTH_SCOPES,
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
});
