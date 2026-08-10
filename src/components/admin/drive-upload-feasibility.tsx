"use client";

import { useState } from "react";

const ALLOWED_TYPES = new Set(["image/heic", "image/jpeg", "image/png"]);

interface ErrorEnvelope {
  error?: {
    code?: string;
    message?: string;
  };
}

interface SessionResponse {
  uploadId: string;
  uploadUrl: string;
}

interface CompletionResponse {
  destinationName: string;
  mimeType: string;
  sizeBytes: number;
  status: "COMPLETED";
}

type UploadState =
  | { kind: "idle" }
  | { kind: "loading"; message: string }
  | { kind: "error"; message: string }
  | { kind: "success"; reconciled: boolean; result: CompletionResponse };

type FailureCode =
  | "NETWORK_OR_CORS"
  | "PROVIDER_RATE_LIMITED"
  | "PROVIDER_REJECTED"
  | "PROVIDER_RESPONSE_INVALID"
  | "PROVIDER_TRANSIENT_ERROR"
  | "UPLOAD_SESSION_EXPIRED";

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) {
    return `${Math.ceil(bytes / 1024)} KiB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}

async function readJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

function classifyProviderStatus(status: number): FailureCode {
  if (status === 404) {
    return "UPLOAD_SESSION_EXPIRED";
  }

  if (status === 429) {
    return "PROVIDER_RATE_LIMITED";
  }

  if (status >= 500) {
    return "PROVIDER_TRANSIENT_ERROR";
  }

  return "PROVIDER_REJECTED";
}

async function reportFailure(input: {
  code: FailureCode;
  providerStatus?: number;
  stage: "provider_response" | "provider_upload";
  uploadId: string;
}): Promise<void> {
  try {
    await fetch("/api/drive/feasibility-upload/report", {
      body: JSON.stringify(input),
      cache: "no-store",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
  } catch {
    // The visible error still carries the feasibility result if reporting is unavailable.
  }
}

async function requestCompletion(
  uploadId: string,
  providerFileId?: string,
): Promise<CompletionResponse> {
  const completionResponse = await fetch(
    "/api/drive/feasibility-upload/complete",
    {
      body: JSON.stringify({
        ...(providerFileId ? { providerFileId } : {}),
        uploadId,
      }),
      cache: "no-store",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      method: "POST",
    },
  );
  const completionBody = await readJson<CompletionResponse | ErrorEnvelope>(
    completionResponse,
  );

  if (!completionResponse.ok || !("status" in completionBody)) {
    const errorBody = completionBody as ErrorEnvelope;
    throw new Error(
      errorBody.error?.message ?? "Drive completion verification failed.",
    );
  }

  return completionBody;
}

export function DriveUploadFeasibility({ maxBytes }: { maxBytes: number }) {
  const [file, setFile] = useState<File | null>(null);
  const [state, setState] = useState<UploadState>({ kind: "idle" });

  function selectFile(nextFile: File | null): void {
    setState({ kind: "idle" });

    if (!nextFile) {
      setFile(null);
      return;
    }

    if (!ALLOWED_TYPES.has(nextFile.type)) {
      setFile(null);
      setState({ kind: "error", message: "Choose a JPEG, PNG, or HEIC image." });
      return;
    }

    if (nextFile.size <= 0 || nextFile.size > maxBytes) {
      setFile(null);
      setState({
        kind: "error",
        message: `Choose a non-empty image no larger than ${formatBytes(maxBytes)}.`,
      });
      return;
    }

    setFile(nextFile);
  }

  async function startUpload(): Promise<void> {
    if (!file) {
      setState({ kind: "error", message: "Choose one disposable test image first." });
      return;
    }

    setState({ kind: "loading", message: "Creating resumable Drive session…" });

    try {
      const sessionResponse = await fetch(
        "/api/drive/feasibility-upload/session",
        {
          body: JSON.stringify({ mimeType: file.type, sizeBytes: file.size }),
          cache: "no-store",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          method: "POST",
        },
      );
      const sessionBody = await readJson<SessionResponse | ErrorEnvelope>(sessionResponse);

      if (!sessionResponse.ok || !("uploadUrl" in sessionBody)) {
        const errorBody = sessionBody as ErrorEnvelope;
        throw new Error(errorBody.error?.message ?? "Drive session creation failed.");
      }

      setState({ kind: "loading", message: "Uploading bytes directly to Google Drive…" });

      let providerResponse: Response;

      try {
        providerResponse = await fetch(sessionBody.uploadUrl, {
          body: file,
          headers: { "Content-Type": file.type },
          method: "PUT",
        });
      } catch {
        await reportFailure({
          code: "NETWORK_OR_CORS",
          stage: "provider_upload",
          uploadId: sessionBody.uploadId,
        });
        setState({
          kind: "loading",
          message: "Browser response was ambiguous; reconciling with Google Drive…",
        });

        try {
          const reconciled = await requestCompletion(sessionBody.uploadId);
          setState({ kind: "success", reconciled: true, result: reconciled });
          return;
        } catch {
          throw new Error(
            "Direct browser upload returned an ambiguous network/CORS result, and server reconciliation could not verify a completed file. Stop the feasibility gate.",
          );
        }
      }

      if (!providerResponse.ok) {
        const code = classifyProviderStatus(providerResponse.status);
        await reportFailure({
          code,
          providerStatus: providerResponse.status,
          stage: "provider_upload",
          uploadId: sessionBody.uploadId,
        });
        throw new Error(
          `Google Drive rejected the byte upload with HTTP ${providerResponse.status}.`,
        );
      }

      let providerFileId: string | undefined;

      try {
        const providerBody = (await providerResponse.json()) as { id?: unknown };
        providerFileId =
          typeof providerBody.id === "string" && providerBody.id
            ? providerBody.id
            : undefined;
      } catch {
        providerFileId = undefined;
      }

      if (!providerFileId) {
        await reportFailure({
          code: "PROVIDER_RESPONSE_INVALID",
          stage: "provider_response",
          uploadId: sessionBody.uploadId,
        });
        setState({
          kind: "loading",
          message: "Provider returned no readable file ID; reconciling with Google Drive…",
        });
        const reconciled = await requestCompletion(sessionBody.uploadId);
        setState({ kind: "success", reconciled: true, result: reconciled });
        return;
      }

      setState({ kind: "loading", message: "Verifying provider-confirmed file…" });
      const completion = await requestCompletion(
        sessionBody.uploadId,
        providerFileId,
      );
      setState({ kind: "success", reconciled: false, result: completion });
    } catch (error) {
      setState({
        kind: "error",
        message: error instanceof Error ? error.message : "Feasibility upload failed.",
      });
    }
  }

  const loading = state.kind === "loading";

  return (
    <section className="mt-8 rounded-2xl border border-amber-200 bg-amber-50 p-6">
      <p className="text-sm font-semibold uppercase tracking-[0.16em] text-amber-800">
        Milestone 0 gate
      </p>
      <h2 className="mt-2 text-xl font-semibold text-amber-950">
        Test direct browser upload
      </h2>
      <p className="mt-2 text-sm leading-6 text-amber-900">
        Use one disposable image only. Syrax creates a resumable session; your browser sends bytes
        directly to Google Drive; the server then verifies the resulting file.
      </p>

      <label className="mt-5 block text-sm font-semibold text-amber-950" htmlFor="spike-file">
        Disposable JPEG, PNG, or HEIC
      </label>
      <input
        accept="image/jpeg,image/png,image/heic"
        className="mt-2 block w-full rounded-lg border border-amber-300 bg-white px-3 py-3 text-sm file:mr-4 file:rounded-full file:border-0 file:bg-amber-800 file:px-4 file:py-2 file:font-semibold file:text-white"
        disabled={loading}
        id="spike-file"
        onChange={(event) => selectFile(event.target.files?.[0] ?? null)}
        type="file"
      />
      {file ? (
        <p className="mt-2 text-sm text-amber-900">
          Selected {file.name} ({formatBytes(file.size)})
        </p>
      ) : null}

      <button
        className="mt-5 inline-flex min-h-12 items-center justify-center rounded-full bg-amber-900 px-6 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-amber-900"
        disabled={!file || loading}
        onClick={() => void startUpload()}
        type="button"
      >
        {loading ? "Testing…" : "Run one-file test"}
      </button>

      <div aria-live="polite" className="mt-4 min-h-6 text-sm" role="status">
        {state.kind === "loading" ? <p className="text-amber-900">{state.message}</p> : null}
        {state.kind === "error" ? <p className="font-semibold text-red-800">{state.message}</p> : null}
        {state.kind === "success" ? (
          <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-emerald-950">
            <p className="font-semibold">Provider-confirmed upload complete.</p>
            {state.reconciled ? (
              <p className="mt-1 text-xs">
                Browser response was ambiguous; server reconciliation confirmed the file.
              </p>
            ) : null}
            <p className="mt-1 break-all text-xs">{state.result.destinationName}</p>
            <p className="mt-1 text-xs">
              {state.result.mimeType} · {formatBytes(state.result.sizeBytes)}
            </p>
          </div>
        ) : null}
      </div>
    </section>
  );
}
