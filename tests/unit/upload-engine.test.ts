import { describe, expect, it, vi } from "vitest";

import {
  contentRangeForChunk,
  uploadFileToDrive,
} from "@/lib/upload-engine";

describe("contentRangeForChunk", () => {
  it("uses inclusive HTTP end offsets", () => {
    expect(contentRangeForChunk(0, 262_144, 300_000)).toBe(
      "bytes 0-262143/300000",
    );
    expect(contentRangeForChunk(262_144, 300_000, 300_000)).toBe(
      "bytes 262144-299999/300000",
    );
  });

  it("rejects invalid bounds", () => {
    expect(() => contentRangeForChunk(10, 10, 100)).toThrow(RangeError);
    expect(() => contentRangeForChunk(0, 101, 100)).toThrow(RangeError);
  });
});

describe("uploadFileToDrive", () => {
  it("uploads aligned chunks and completes through the control plane", async () => {
    const providerUrl =
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=test";
    const providerRanges: string[] = [];
    let providerCall = 0;
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url === "/api/upload-sessions") {
        return Response.json({
          bytesConfirmed: 0,
          chunkSizeBytes: 262_144,
          fileId: "file_test",
          state: "SESSION_READY",
          uploadUrl: providerUrl,
        });
      }

      if (url === providerUrl) {
        providerRanges.push(new Headers(init?.headers).get("Content-Range") ?? "");
        providerCall += 1;

        if (providerCall === 1) {
          return new Response(null, {
            status: 308,
            headers: { Range: "bytes=0-262143" },
          });
        }

        return Response.json({ id: "provider-file" }, { status: 200 });
      }

      if (url.endsWith("/complete")) {
        return Response.json({
          bytesConfirmed: 300_000,
          fileId: "file_test",
          state: "COMPLETED",
        });
      }

      throw new Error(`Unexpected request: ${url}`);
    });
    const progress = vi.fn();
    const result = await uploadFileToDrive({
      fetchImpl: fetchImpl as typeof fetch,
      file: new Blob([new Uint8Array(300_000)], { type: "image/jpeg" }),
      identity: {
        clientFileId: "client-file",
        fileId: "file_test",
        portalToken: "portal-token",
        submissionId: "submission-test",
      },
      onProgress: progress,
      signal: new AbortController().signal,
    });

    expect(result).toEqual({
      bytesConfirmed: 300_000,
      fileId: "file_test",
      state: "COMPLETED",
    });
    expect(providerRanges).toEqual([
      "bytes 0-262143/300000",
      "bytes 262144-299999/300000",
    ]);
    expect(progress).toHaveBeenCalledWith({
      confirmedBytes: 300_000,
      state: "VERIFYING",
      totalBytes: 300_000,
    });
  });

  it("reconciles an ambiguous browser/provider response through the server", async () => {
    const providerUrl =
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=ambiguous";
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url === "/api/upload-sessions") {
        return Response.json({
          bytesConfirmed: 0,
          chunkSizeBytes: 262_144,
          fileId: "file_test",
          state: "SESSION_READY",
          uploadUrl: providerUrl,
        });
      }

      if (url === providerUrl) {
        throw new TypeError("Failed to fetch");
      }

      if (url.endsWith("/status")) {
        return Response.json({
          bytesConfirmed: 100,
          fileId: "file_test",
          state: "COMPLETED",
        });
      }

      throw new Error(`Unexpected request: ${url}`);
    });

    await expect(
      uploadFileToDrive({
        fetchImpl: fetchImpl as typeof fetch,
        file: new Blob([new Uint8Array(100)], { type: "image/jpeg" }),
        identity: {
          clientFileId: "client-file",
          fileId: "file_test",
          portalToken: "portal-token",
          submissionId: "submission-test",
        },
        signal: new AbortController().signal,
      }),
    ).resolves.toEqual({
      bytesConfirmed: 100,
      fileId: "file_test",
      state: "COMPLETED",
    });
  });
});
