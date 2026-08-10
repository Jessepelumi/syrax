import "server-only";

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const AUTH_TAG_BYTES = 16;
const NONCE_BYTES = 12;
const TOKEN_VERSION = "v1";
const ADDITIONAL_DATA_PREFIX = "syrax-intake:portal-capability:v1";

export class PortalTokenVaultError extends Error {
  constructor() {
    super("Portal token decryption failed");
    this.name = "PortalTokenVaultError";
  }
}

export interface PortalTokenVault {
  decrypt(ciphertext: string, publicTokenHash: string): string;
  encrypt(plaintext: string, publicTokenHash: string): string;
  readonly version: typeof TOKEN_VERSION;
}

function additionalData(publicTokenHash: string): Buffer {
  if (!publicTokenHash) {
    throw new Error("Portal token hash is required");
  }

  return Buffer.from(`${ADDITIONAL_DATA_PREFIX}\0${publicTokenHash}`, "utf8");
}

export function createPortalTokenVault(base64Key: string): PortalTokenVault {
  const key = Buffer.from(base64Key, "base64");

  if (key.byteLength !== 32) {
    throw new Error("Portal token encryption key must contain exactly 32 bytes");
  }

  return {
    version: TOKEN_VERSION,
    encrypt(plaintext: string, publicTokenHash: string): string {
      if (!plaintext) {
        throw new Error("Cannot encrypt an empty portal token");
      }

      const nonce = randomBytes(NONCE_BYTES);
      const cipher = createCipheriv(ALGORITHM, key, nonce, {
        authTagLength: AUTH_TAG_BYTES,
      });
      cipher.setAAD(additionalData(publicTokenHash));
      const encrypted = Buffer.concat([
        cipher.update(plaintext, "utf8"),
        cipher.final(),
      ]);
      const authTag = cipher.getAuthTag();

      return [
        TOKEN_VERSION,
        nonce.toString("base64url"),
        encrypted.toString("base64url"),
        authTag.toString("base64url"),
      ].join(".");
    },
    decrypt(ciphertext: string, publicTokenHash: string): string {
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
          throw new PortalTokenVaultError();
        }

        const nonce = Buffer.from(encodedNonce, "base64url");
        const encrypted = Buffer.from(encodedCiphertext, "base64url");
        const authTag = Buffer.from(encodedAuthTag, "base64url");

        if (nonce.byteLength !== NONCE_BYTES || authTag.byteLength !== AUTH_TAG_BYTES) {
          throw new PortalTokenVaultError();
        }

        const decipher = createDecipheriv(ALGORITHM, key, nonce, {
          authTagLength: AUTH_TAG_BYTES,
        });
        decipher.setAAD(additionalData(publicTokenHash));
        decipher.setAuthTag(authTag);

        return Buffer.concat([
          decipher.update(encrypted),
          decipher.final(),
        ]).toString("utf8");
      } catch {
        throw new PortalTokenVaultError();
      }
    },
  };
}
