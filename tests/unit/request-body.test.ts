import { describe, expect, it } from "vitest";

import {
  hasJsonContentType,
  readJsonBody,
  RequestBodyError,
} from "@/lib/request-body";

describe("hasJsonContentType", () => {
  it("accepts JSON with an optional charset and rejects other media types", () => {
    expect(
      hasJsonContentType(
        new Request("https://syrax.test/api", {
          headers: { "Content-Type": "application/json; charset=utf-8" },
        }),
      ),
    ).toBe(true);
    expect(
      hasJsonContentType(
        new Request("https://syrax.test/api", {
          headers: { "Content-Type": "text/plain" },
        }),
      ),
    ).toBe(false);
  });
});

describe("readJsonBody", () => {
  it("parses JSON within the byte limit", async () => {
    const request = new Request("https://syrax.test/api", {
      method: "POST",
      body: JSON.stringify({ ok: true }),
    });

    await expect(readJsonBody(request, 1024)).resolves.toEqual({ ok: true });
  });

  it("rejects malformed JSON", async () => {
    const request = new Request("https://syrax.test/api", {
      method: "POST",
      body: "not-json",
    });

    await expect(readJsonBody(request, 1024)).rejects.toMatchObject({
      code: "INVALID_JSON",
    } satisfies Partial<RequestBodyError>);
  });

  it("rejects a declared body larger than the limit before reading", async () => {
    const request = new Request("https://syrax.test/api", {
      method: "POST",
      body: "{}",
      headers: { "Content-Length": "2048" },
    });

    await expect(readJsonBody(request, 1024)).rejects.toMatchObject({
      code: "REQUEST_TOO_LARGE",
    } satisfies Partial<RequestBodyError>);
  });

  it("stops an undeclared body after its streamed bytes cross the limit", async () => {
    const request = new Request("https://syrax.test/api", {
      method: "POST",
      body: JSON.stringify({ value: "x".repeat(2048) }),
    });

    await expect(readJsonBody(request, 1024)).rejects.toMatchObject({
      code: "REQUEST_TOO_LARGE",
    } satisfies Partial<RequestBodyError>);
  });
});
