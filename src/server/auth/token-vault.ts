import "server-only";

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const AUTH_TAG_BYTES = 16;
const NONCE_BYTES = 12;
const TOKEN_VERSION = "v1";
const ADDITIONAL_DATA = Buffer.from("syrax-intake:google-refresh-token:v1", "utf8");

export class TokenVaultError extends Error {
  constructor() {
    super("Token decryption failed");
    this.name = "TokenVaultError";
  }
}

export interface TokenVault {
  decrypt(ciphertext: string): string;
  encrypt(plaintext: string): string;
  readonly version: typeof TOKEN_VERSION;
}

export function createTokenVault(base64Key: string): TokenVault {
  const key = Buffer.from(base64Key, "base64");

  if (key.byteLength !== 32) {
    throw new Error("Token encryption key must contain exactly 32 bytes");
  }

  return {
    version: TOKEN_VERSION,
    encrypt(plaintext: string): string {
      if (!plaintext) {
        throw new Error("Cannot encrypt an empty token");
      }

      const nonce = randomBytes(NONCE_BYTES);
      const cipher = createCipheriv(ALGORITHM, key, nonce, { authTagLength: AUTH_TAG_BYTES });
      cipher.setAAD(ADDITIONAL_DATA);
      const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
      const authTag = cipher.getAuthTag();

      return [
        TOKEN_VERSION,
        nonce.toString("base64url"),
        encrypted.toString("base64url"),
        authTag.toString("base64url"),
      ].join(".");
    },
    decrypt(ciphertext: string): string {
      try {
        const [version, encodedNonce, encodedCiphertext, encodedAuthTag, extra] =
          ciphertext.split(".");

        if (
          version !== TOKEN_VERSION ||
          !encodedNonce ||
          !encodedCiphertext ||
          !encodedAuthTag ||
          extra
        ) {
          throw new TokenVaultError();
        }

        const nonce = Buffer.from(encodedNonce, "base64url");
        const encrypted = Buffer.from(encodedCiphertext, "base64url");
        const authTag = Buffer.from(encodedAuthTag, "base64url");

        if (nonce.byteLength !== NONCE_BYTES || authTag.byteLength !== AUTH_TAG_BYTES) {
          throw new TokenVaultError();
        }

        const decipher = createDecipheriv(ALGORITHM, key, nonce, {
          authTagLength: AUTH_TAG_BYTES,
        });
        decipher.setAAD(ADDITIONAL_DATA);
        decipher.setAuthTag(authTag);

        return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
      } catch {
        throw new TokenVaultError();
      }
    },
  };
}
