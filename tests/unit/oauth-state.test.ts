import { describe, expect, it } from "vitest";

import { createOAuthState, matchesOAuthState } from "@/server/auth/oauth-state";

describe("OAuth state", () => {
  it("creates unique 256-bit base64url values", () => {
    const first = createOAuthState();
    const second = createOAuthState();

    expect(first).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(first).not.toBe(second);
  });

  it("accepts only an exact state match", () => {
    const state = createOAuthState();

    expect(matchesOAuthState(state, state)).toBe(true);
    expect(matchesOAuthState(state, `${state}x`)).toBe(false);
    expect(matchesOAuthState(undefined, state)).toBe(false);
    expect(matchesOAuthState(state, null)).toBe(false);
  });
});
