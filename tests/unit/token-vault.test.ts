import { describe, expect, it } from "vitest";

import { createTokenVault, TokenVaultError } from "@/server/auth/token-vault";

describe("token vault", () => {
  const key = Buffer.alloc(32, 17).toString("base64");

  it("encrypts and decrypts a refresh token", () => {
    const vault = createTokenVault(key);
    const encrypted = vault.encrypt("test-refresh-token");

    expect(encrypted).not.toContain("test-refresh-token");
    expect(vault.decrypt(encrypted)).toBe("test-refresh-token");
  });

  it("uses a unique nonce for each encryption", () => {
    const vault = createTokenVault(key);

    expect(vault.encrypt("same-token")).not.toBe(vault.encrypt("same-token"));
  });

  it("rejects tampered ciphertext", () => {
    const vault = createTokenVault(key);
    const parts = vault.encrypt("test-refresh-token").split(".");
    parts[2] = `${parts[2] === "A" ? "B" : "A"}${parts[2].slice(1)}`;

    expect(() => vault.decrypt(parts.join("."))).toThrow(TokenVaultError);
  });

  it("rejects decryption with another key", () => {
    const encrypted = createTokenVault(key).encrypt("test-refresh-token");
    const otherVault = createTokenVault(Buffer.alloc(32, 18).toString("base64"));

    expect(() => otherVault.decrypt(encrypted)).toThrow(TokenVaultError);
  });
});
