import { describe, expect, it } from "vitest";

import {
  createUploadSessionVault,
  UploadSessionVaultError,
} from "@/server/uploads/session-vault";

describe("upload session vault", () => {
  const key = Buffer.alloc(32, 29).toString("base64");
  const sessionUrl =
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=secret";

  it("encrypts and decrypts a provider session URI", () => {
    const vault = createUploadSessionVault(key);
    const encrypted = vault.encrypt(sessionUrl);

    expect(encrypted).not.toContain("googleapis");
    expect(vault.decrypt(encrypted)).toBe(sessionUrl);
  });

  it("uses a distinct nonce for each encrypted value", () => {
    const vault = createUploadSessionVault(key);

    expect(vault.encrypt(sessionUrl)).not.toBe(vault.encrypt(sessionUrl));
  });

  it("rejects tampering and a different key", () => {
    const vault = createUploadSessionVault(key);
    const parts = vault.encrypt(sessionUrl).split(".");
    parts[2] = `${parts[2].startsWith("A") ? "B" : "A"}${parts[2].slice(1)}`;

    expect(() => vault.decrypt(parts.join("."))).toThrow(UploadSessionVaultError);
    expect(() =>
      createUploadSessionVault(Buffer.alloc(32, 30).toString("base64")).decrypt(
        vault.encrypt(sessionUrl),
      ),
    ).toThrow(UploadSessionVaultError);
  });
});
