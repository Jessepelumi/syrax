export type BrowserUploadState =
  | "SESSION_READY"
  | "UPLOADING"
  | "RETRY_WAIT"
  | "VERIFYING"
  | "COMPLETED";

export interface BrowserUploadIdentity {
  clientFileId: string;
  fileId: string;
  portalToken: string;
  submissionId: string;
}

export interface BrowserUploadProgress {
  confirmedBytes: number;
  state: BrowserUploadState;
  totalBytes: number;
}

export interface BrowserUploadResult {
  bytesConfirmed: number;
  fileId: string;
  state: "COMPLETED";
}

interface UploadSessionDescriptor {
  bytesConfirmed: number;
  chunkSizeBytes: number;
  expiresAt?: string;
  fileId: string;
  state: BrowserUploadState | "FAILED" | "CANCELLED" | "EXPIRED";
  uploadUrl?: string;
}

interface UploadStatusResponse {
  bytesConfirmed: number;
  fileId: string;
  state: BrowserUploadState | "FAILED" | "CANCELLED" | "EXPIRED";
}

interface ErrorEnvelope {
  error?: {
    code?: string;
    message?: string;
    retryable?: boolean;
  };
}

export class BrowserUploadError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "BrowserUploadError";
  }
}

const CHUNK_ALIGNMENT_BYTES = 256 * 1024;
const DEFAULT_MAX_ATTEMPTS = 5;

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw new DOMException("Upload cancelled", "AbortError");
  }
}

function isSafeGoogleUploadUrl(value: string): boolean {
  try {
    const url = new URL(value);

    return (
      url.protocol === "https:" &&
      url.hostname === "www.googleapis.com" &&
      url.pathname === "/upload/drive/v3/files" &&
      url.searchParams.get("uploadType") === "resumable" &&
      Boolean(url.searchParams.get("upload_id"))
    );
  } catch {
    return false;
  }
}

function parseRangeHeader(value: string | null, totalBytes: number): number | null {
  if (!value) {
    return null;
  }

  const match = /^bytes=0-(\d+)$/.exec(value.trim());

  if (!match) {
    return null;
  }

  const confirmedBytes = Number(match[1]) + 1;

  return Number.isSafeInteger(confirmedBytes) &&
    confirmedBytes > 0 &&
    confirmedBytes <= totalBytes
    ? confirmedBytes
    : null;
}

function retryDelayMilliseconds(attempt: number): number {
  const exponential = Math.min(4_000, 250 * 2 ** Math.max(0, attempt - 1));
  const jitter = Math.floor(Math.random() * Math.max(1, exponential / 4));

  return exponential + jitter;
}

async function delay(milliseconds: number, signal: AbortSignal): Promise<void> {
  throwIfAborted(signal);

  await new Promise<void>((resolve, reject) => {
    function aborted() {
      clearTimeout(timeout);
      reject(new DOMException("Upload cancelled", "AbortError"));
    }

    const timeout = setTimeout(() => {
      signal.removeEventListener("abort", aborted);
      resolve();
    }, milliseconds);

    signal.addEventListener(
      "abort",
      aborted,
      { once: true },
    );
  });
}

async function waitForOnline(signal: AbortSignal): Promise<void> {
  if (
    typeof window === "undefined" ||
    typeof navigator === "undefined" ||
    navigator.onLine
  ) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    function cleanup() {
      window.removeEventListener("online", online);
      signal.removeEventListener("abort", aborted);
    }

    function online() {
      cleanup();
      resolve();
    }

    function aborted() {
      cleanup();
      reject(new DOMException("Upload cancelled", "AbortError"));
    }

    window.addEventListener("online", online, { once: true });
    signal.addEventListener("abort", aborted, { once: true });
  });
}

async function readControlPlaneResponse<T>(response: Response): Promise<T> {
  const body = (await response.json().catch(() => null)) as
    | ErrorEnvelope
    | T
    | null;

  if (!response.ok) {
    const error = (body as ErrorEnvelope | null)?.error;
    throw new BrowserUploadError(
      error?.code ?? "CONTROL_PLANE_ERROR",
      error?.message ?? "Upload request failed.",
      error?.retryable ?? false,
    );
  }

  if (!body) {
    throw new BrowserUploadError(
      "CONTROL_PLANE_RESPONSE_INVALID",
      "Upload service returned an invalid response.",
      true,
    );
  }

  return body as T;
}

async function postControlPlane<T>(
  fetchImpl: typeof fetch,
  url: string,
  body: Record<string, unknown>,
  signal: AbortSignal,
): Promise<T> {
  let response: Response;

  try {
    response = await fetchImpl(url, {
      body: JSON.stringify(body),
      cache: "no-store",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      method: "POST",
      signal,
    });
  } catch (error) {
    if (isAbortError(error)) {
      throw error;
    }

    throw new BrowserUploadError(
      "CONTROL_PLANE_NETWORK_ERROR",
      "Could not reach the upload service.",
      true,
    );
  }

  return readControlPlaneResponse<T>(response);
}

function identityBody(identity: BrowserUploadIdentity): Record<string, string> {
  return {
    clientFileId: identity.clientFileId,
    portalToken: identity.portalToken,
    submissionId: identity.submissionId,
  };
}

async function reconcileStatus(
  fetchImpl: typeof fetch,
  identity: BrowserUploadIdentity,
  signal: AbortSignal,
): Promise<UploadStatusResponse> {
  return postControlPlane<UploadStatusResponse>(
    fetchImpl,
    `/api/upload-sessions/${encodeURIComponent(identity.fileId)}/status`,
    identityBody(identity),
    signal,
  );
}

async function confirmCompletion(
  fetchImpl: typeof fetch,
  identity: BrowserUploadIdentity,
  signal: AbortSignal,
  providerFileId?: string,
): Promise<BrowserUploadResult> {
  const result = await postControlPlane<UploadStatusResponse>(
    fetchImpl,
    `/api/upload-sessions/${encodeURIComponent(identity.fileId)}/complete`,
    {
      ...identityBody(identity),
      ...(providerFileId ? { providerFileId } : {}),
    },
    signal,
  );

  if (result.state !== "COMPLETED") {
    throw new BrowserUploadError(
      "UPLOAD_VERIFICATION_FAILED",
      "Google Drive has not confirmed the completed file.",
      true,
    );
  }

  return { ...result, state: "COMPLETED" };
}

export function contentRangeForChunk(
  startByte: number,
  endExclusive: number,
  totalBytes: number,
): string {
  if (
    !Number.isSafeInteger(startByte) ||
    !Number.isSafeInteger(endExclusive) ||
    !Number.isSafeInteger(totalBytes) ||
    startByte < 0 ||
    endExclusive <= startByte ||
    endExclusive > totalBytes
  ) {
    throw new RangeError("Invalid upload chunk bounds");
  }

  return `bytes ${startByte}-${endExclusive - 1}/${totalBytes}`;
}

export async function uploadFileToDrive(input: {
  fetchImpl?: typeof fetch;
  file: Blob;
  identity: BrowserUploadIdentity;
  maxAttempts?: number;
  onProgress?: (progress: BrowserUploadProgress) => void;
  signal: AbortSignal;
}): Promise<BrowserUploadResult> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const maxAttempts = input.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const totalBytes = input.file.size;

  if (!Number.isSafeInteger(totalBytes) || totalBytes <= 0) {
    throw new BrowserUploadError(
      "FILE_METADATA_INVALID",
      "The selected file is empty or invalid.",
      false,
    );
  }

  const descriptor = await postControlPlane<UploadSessionDescriptor>(
    fetchImpl,
    "/api/upload-sessions",
    { ...identityBody(input.identity), fileId: input.identity.fileId },
    input.signal,
  );

  if (descriptor.state === "COMPLETED") {
    return {
      bytesConfirmed: descriptor.bytesConfirmed,
      fileId: descriptor.fileId,
      state: "COMPLETED",
    };
  }

  if (
    !descriptor.uploadUrl ||
    !isSafeGoogleUploadUrl(descriptor.uploadUrl) ||
    !Number.isSafeInteger(descriptor.chunkSizeBytes) ||
    descriptor.chunkSizeBytes <= 0 ||
    descriptor.chunkSizeBytes % CHUNK_ALIGNMENT_BYTES !== 0 ||
    descriptor.bytesConfirmed < 0 ||
    descriptor.bytesConfirmed > totalBytes
  ) {
    throw new BrowserUploadError(
      "UPLOAD_SESSION_INVALID",
      "Upload service returned an invalid Drive session.",
      false,
    );
  }

  let confirmedBytes = descriptor.bytesConfirmed;
  let attemptsWithoutProgress = 0;

  input.onProgress?.({
    confirmedBytes,
    state: "SESSION_READY",
    totalBytes,
  });

  while (confirmedBytes < totalBytes) {
    throwIfAborted(input.signal);
    await waitForOnline(input.signal);
    const endExclusive = Math.min(
      totalBytes,
      confirmedBytes + descriptor.chunkSizeBytes,
    );
    const chunk = input.file.slice(confirmedBytes, endExclusive);
    let nextConfirmedBytes: number | undefined;

    try {
      const providerResponse = await fetchImpl(descriptor.uploadUrl, {
        body: chunk,
        headers: {
          "Content-Range": contentRangeForChunk(
            confirmedBytes,
            endExclusive,
            totalBytes,
          ),
          "Content-Type": input.file.type || "application/octet-stream",
        },
        method: "PUT",
        redirect: "manual",
        signal: input.signal,
      });

      if (providerResponse.status === 200 || providerResponse.status === 201) {
        const providerBody = (await providerResponse.json().catch(() => null)) as
          | { id?: unknown }
          | null;
        const providerFileId =
          typeof providerBody?.id === "string" ? providerBody.id : undefined;

        input.onProgress?.({
          confirmedBytes: totalBytes,
          state: "VERIFYING",
          totalBytes,
        });
        return await confirmCompletion(
          fetchImpl,
          input.identity,
          input.signal,
          providerFileId,
        );
      }

      if (providerResponse.status === 308) {
        nextConfirmedBytes = parseRangeHeader(
          providerResponse.headers.get("range"),
          totalBytes,
        ) ?? undefined;
      }
    } catch (error) {
      if (isAbortError(error)) {
        throw error;
      }
    }

    if (nextConfirmedBytes === undefined) {
      try {
        const status = await reconcileStatus(
          fetchImpl,
          input.identity,
          input.signal,
        );

        if (status.state === "COMPLETED") {
          return { ...status, state: "COMPLETED" };
        }

        nextConfirmedBytes = status.bytesConfirmed;
      } catch (error) {
        if (isAbortError(error)) {
          throw error;
        }

        if (!(error instanceof BrowserUploadError) || !error.retryable) {
          throw error;
        }
      }
    }

    if (
      nextConfirmedBytes !== undefined &&
      nextConfirmedBytes > confirmedBytes &&
      nextConfirmedBytes <= totalBytes
    ) {
      confirmedBytes = nextConfirmedBytes;
      attemptsWithoutProgress = 0;
      input.onProgress?.({
        confirmedBytes,
        state: confirmedBytes === totalBytes ? "VERIFYING" : "UPLOADING",
        totalBytes,
      });
      continue;
    }

    attemptsWithoutProgress += 1;

    if (attemptsWithoutProgress >= maxAttempts) {
      throw new BrowserUploadError(
        "UPLOAD_RETRY_EXHAUSTED",
        "Upload did not make progress after several retries.",
        false,
      );
    }

    input.onProgress?.({
      confirmedBytes,
      state: "RETRY_WAIT",
      totalBytes,
    });
    await delay(retryDelayMilliseconds(attemptsWithoutProgress), input.signal);
  }

  return confirmCompletion(fetchImpl, input.identity, input.signal);
}

export async function cancelDriveUpload(
  fetchImpl: typeof fetch,
  identity: BrowserUploadIdentity,
): Promise<void> {
  const controller = new AbortController();
  await postControlPlane<UploadStatusResponse>(
    fetchImpl,
    `/api/upload-sessions/${encodeURIComponent(identity.fileId)}/cancel`,
    identityBody(identity),
    controller.signal,
  );
}
