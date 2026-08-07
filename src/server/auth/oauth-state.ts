import { randomBytes, timingSafeEqual } from "node:crypto";

export const OAUTH_STATE_COOKIE = "syrax_oauth_state";
export const OAUTH_STATE_MAX_AGE_SECONDS = 10 * 60;

export function createOAuthState(): string {
  return randomBytes(32).toString("base64url");
}

export function matchesOAuthState(expected: string | undefined, returned: string | null): boolean {
  if (!expected || !returned) {
    return false;
  }

  const expectedBytes = Buffer.from(expected, "utf8");
  const returnedBytes = Buffer.from(returned, "utf8");

  return (
    expectedBytes.byteLength === returnedBytes.byteLength &&
    timingSafeEqual(expectedBytes, returnedBytes)
  );
}
