import { describe, expect, it } from "vitest";

import {
  createPortalTokenVault,
  PortalTokenVaultError,
} from "@/server/portals/portal-token-vault";

describe("portal token vault", () => {
  const key = Buffer.alloc(32, 23).toString("base64");
  const tokenHash = "portal-token-hash";

  it("encrypts a portal capability for later admin display", () => {
    const vault = createPortalTokenVault(key);
    const encrypted = vault.encrypt("guest-capability", tokenHash);

    expect(encrypted).not.toContain("guest-capability");
    expect(vault.decrypt(encrypted, tokenHash)).toBe("guest-capability");
  });

  it("binds ciphertext to the portal token hash", () => {
    const vault = createPortalTokenVault(key);
    const encrypted = vault.encrypt("guest-capability", tokenHash);

    expect(() => vault.decrypt(encrypted, "another-token-hash")).toThrow(
      PortalTokenVaultError,
    );
  });
});
