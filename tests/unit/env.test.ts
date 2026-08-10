import { describe, expect, it } from "vitest";

import { parseEnvironment } from "@/lib/env";

const validEnvironment = {
  NODE_ENV: "test",
  APP_BASE_URL: "http://localhost:3000",
  DATABASE_URL: "postgresql://user:password@localhost:5432/syrax",
  ADMIN_EMAIL: " Host@Example.com ",
  ADMIN_SESSION_SECRET: "a-session-secret-that-is-longer-than-32-characters",
  TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
  GOOGLE_CLIENT_ID: "client-id",
  GOOGLE_CLIENT_SECRET: "client-secret",
  GOOGLE_OAUTH_REDIRECT_URI: "http://localhost:3000/api/auth/google/callback",
  GOOGLE_API_KEY: "api-key",
  GOOGLE_CLOUD_PROJECT_NUMBER: "123456789",
  DEFAULT_PORTAL_EXPIRY: "2026-08-31T23:59:59Z",
  MAX_FILE_SIZE_BYTES: "2147483648",
  MAX_FILES_PER_SUBMISSION: "50",
  MAX_SUBMISSION_BYTES: "10737418240",
  UPLOAD_CHUNK_SIZE_BYTES: "8388608",
  UPLOAD_CLIENT_CONCURRENCY: "2",
  LOG_LEVEL: "info",
};

describe("parseEnvironment", () => {
  it("parses, normalizes, and coerces valid values", () => {
    const environment = parseEnvironment(validEnvironment);

    expect(environment.ADMIN_EMAIL).toBe("host@example.com");
    expect(environment.MAX_FILES_PER_SUBMISSION).toBe(50);
    expect(environment.UPLOAD_CHUNK_SIZE_BYTES).toBe(8 * 1024 * 1024);
  });

  it("rejects a token encryption key with the wrong byte length", () => {
    expect(() =>
      parseEnvironment({
        ...validEnvironment,
        TOKEN_ENCRYPTION_KEY: Buffer.alloc(31, 7).toString("base64"),
      }),
    ).toThrow();
  });

  it("rejects a chunk size not aligned to 256 KiB", () => {
    expect(() =>
      parseEnvironment({ ...validEnvironment, UPLOAD_CHUNK_SIZE_BYTES: "1000000" }),
    ).toThrow();
  });

  it("rejects a submission limit smaller than one allowed file", () => {
    expect(() =>
      parseEnvironment({ ...validEnvironment, MAX_SUBMISSION_BYTES: "1024" }),
    ).toThrow();
  });

  it("rejects byte limits that cannot be represented safely in JavaScript", () => {
    expect(() =>
      parseEnvironment({
        ...validEnvironment,
        MAX_FILE_SIZE_BYTES: (Number.MAX_SAFE_INTEGER + 1).toString(),
        MAX_SUBMISSION_BYTES: (Number.MAX_SAFE_INTEGER + 1).toString(),
      }),
    ).toThrow();
  });
});
