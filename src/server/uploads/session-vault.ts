import "server-only";

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const AUTH_TAG_BYTES = 16;
const NONCE_BYTES = 12;
const SESSION_VERSION = "v1";
const ADDITIONAL_DATA = Buffer.from(
  "syrax-intake:drive-upload-session:v1",
  "utf8",
);

export class UploadSessionVaultError extends Error {
  constructor() {
    super("Upload session decryption failed");
    this.name = "UploadSessionVaultError";
  }
}

export interface UploadSessionVault {
  decrypt(ciphertext: string): string;
  encrypt(plaintext: string): string;
  readonly version: typeof SESSION_VERSION;
}

export function createUploadSessionVault(base64Key: string): UploadSessionVault {
  const key = Buffer.from(base64Key, "base64");

  if (key.byteLength !== 32) {
    throw new Error("Upload session encryption key must contain exactly 32 bytes");
  }

  return {
    version: SESSION_VERSION,
    encrypt(plaintext: string): string {
      if (!plaintext) {
        throw new Error("Cannot encrypt an empty upload session");
      }

      const nonce = randomBytes(NONCE_BYTES);
      const cipher = createCipheriv(ALGORITHM, key, nonce, {
        authTagLength: AUTH_TAG_BYTES,
      });
      cipher.setAAD(ADDITIONAL_DATA);
      const encrypted = Buffer.concat([
        cipher.update(plaintext, "utf8"),
        cipher.final(),
      ]);
      const authTag = cipher.getAuthTag();

      return [
        SESSION_VERSION,
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
          version !== SESSION_VERSION ||
          !encodedNonce ||
          !encodedCiphertext ||
          !encodedAuthTag ||
          extra
        ) {
          throw new UploadSessionVaultError();
        }

        const nonce = Buffer.from(encodedNonce, "base64url");
        const encrypted = Buffer.from(encodedCiphertext, "base64url");
        const authTag = Buffer.from(encodedAuthTag, "base64url");

        if (nonce.byteLength !== NONCE_BYTES || authTag.byteLength !== AUTH_TAG_BYTES) {
          throw new UploadSessionVaultError();
        }

        const decipher = createDecipheriv(ALGORITHM, key, nonce, {
          authTagLength: AUTH_TAG_BYTES,
        });
        decipher.setAAD(ADDITIONAL_DATA);
        decipher.setAuthTag(authTag);

        return Buffer.concat([
          decipher.update(encrypted),
          decipher.final(),
        ]).toString("utf8");
      } catch {
        throw new UploadSessionVaultError();
      }
    },
  };
}
