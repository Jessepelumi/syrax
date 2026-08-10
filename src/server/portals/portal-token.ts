import "server-only";

import { createHash, randomBytes } from "node:crypto";

export const PORTAL_TOKEN_BYTES = 32;
export const PORTAL_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export interface GeneratedPortalToken {
  publicToken: string;
  publicTokenHash: string;
}

export function hashPortalToken(publicToken: string): string {
  return createHash("sha256").update(publicToken, "utf8").digest("base64url");
}

export function generatePortalToken(): GeneratedPortalToken {
  const publicToken = randomBytes(PORTAL_TOKEN_BYTES).toString("base64url");

  return {
    publicToken,
    publicTokenHash: hashPortalToken(publicToken),
  };
}

export function isPortalTokenShape(value: string): boolean {
  return PORTAL_TOKEN_PATTERN.test(value);
}
