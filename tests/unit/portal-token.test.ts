import { describe, expect, it } from "vitest";

import {
  generatePortalToken,
  hashPortalToken,
  isPortalTokenShape,
  PORTAL_TOKEN_BYTES,
} from "@/server/portals/portal-token";

describe("portal capability tokens", () => {
  it("generates a URL-safe capability with at least 256 bits of entropy", () => {
    const generated = generatePortalToken();

    expect(PORTAL_TOKEN_BYTES).toBe(32);
    expect(isPortalTokenShape(generated.publicToken)).toBe(true);
    expect(generated.publicToken).toHaveLength(43);
    expect(generated.publicTokenHash).toBe(hashPortalToken(generated.publicToken));
    expect(generated.publicTokenHash).not.toBe(generated.publicToken);
  });

  it("hashes deterministically without storing the raw capability", () => {
    const publicToken = "A".repeat(43);

    expect(hashPortalToken(publicToken)).toBe(hashPortalToken(publicToken));
    expect(hashPortalToken(publicToken)).toHaveLength(43);
  });

  it("generates distinct capabilities", () => {
    const first = generatePortalToken();
    const second = generatePortalToken();

    expect(second.publicToken).not.toBe(first.publicToken);
    expect(second.publicTokenHash).not.toBe(first.publicTokenHash);
  });

  it.each([
    "",
    "A".repeat(42),
    "A".repeat(44),
    `${"A".repeat(42)}=`,
    `${"A".repeat(42)}+`,
    `${"A".repeat(42)}/`,
  ])("rejects malformed public token shape: %s", (value) => {
    expect(isPortalTokenShape(value)).toBe(false);
  });
});
