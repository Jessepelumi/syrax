"use client";

import { useRef, useState } from "react";

import {
  BrowserUploadError,
  cancelDriveUpload,
  uploadFileToDrive,
  type BrowserUploadIdentity,
} from "@/lib/upload-engine";
import { getAggregateUploadProgress } from "@/lib/upload-progress";
import { uploadFileCategoryForMimeType } from "@/lib/mime";
import {
  FileRow,
  type GuestFileRowModel,
  type GuestFileStatus,
} from "@/components/upload/file-row";

interface GuestUploadProps {
  allowedMimeTypes: string[];
  concurrency: number;
  maxImageBytesPerSubmission: number;
  maxImageFileSizeBytes: number;
  maxFilesPerSubmission: number;
  maxSubmissionBytes: number;
  maxVideoBytesPerSubmission: number;
  maxVideoFileSizeBytes: number;
  portalToken: string;
}

interface SubmissionResponse {
  files: Array<{ clientFileId: string; fileId: string }>;
  receiptId: string;
  submissionId: string;
}

interface ErrorEnvelope {
  error?: { message?: string };
}

function newClientFileId(): string {
  if (typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) {
    return `${Math.ceil(bytes / 1024)} KiB`;
  }

  if (bytes >= 1024 * 1024 * 1024) {
    const gibibytes = bytes / (1024 * 1024 * 1024);
    return `${Number.isInteger(gibibytes) ? gibibytes : gibibytes.toFixed(1)} GiB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}

function fingerprint(file: File): string {
  return [file.name, file.size, file.type, file.lastModified].join(":");
}

async function responseError(response: Response): Promise<string> {
  const body = (await response.json().catch(() => null)) as ErrorEnvelope | null;
  return body?.error?.message ?? "Request failed. Try again.";
}

export function GuestUpload(props: GuestUploadProps) {
  const [items, setItems] = useState<GuestFileRowModel[]>([]);
  const [guestName, setGuestName] = useState("");
  const [submissionId, setSubmissionId] = useState<string>();
  const [receiptId, setReceiptId] = useState<string>();
  const [globalError, setGlobalError] = useState<string>();
  const [running, setRunning] = useState(false);
  const controllers = useRef(new Map<string, AbortController>());
  const cancelled = useRef(new Set<string>());
  const allowedMimeTypes = new Set(props.allowedMimeTypes);
  const selectedImageBytes = items.reduce(
    (total, item) =>
      uploadFileCategoryForMimeType(item.file.type) === "IMAGE"
        ? total + item.file.size
        : total,
    0,
  );
  const selectedVideoBytes = items.reduce(
    (total, item) =>
      uploadFileCategoryForMimeType(item.file.type) === "VIDEO"
        ? total + item.file.size
        : total,
    0,
  );
  const selectableMimeTypes = props.allowedMimeTypes.filter((mimeType) => {
    const category = uploadFileCategoryForMimeType(mimeType);

    return category === "IMAGE"
      ? selectedImageBytes < props.maxImageBytesPerSubmission
      : category === "VIDEO"
        ? selectedVideoBytes < props.maxVideoBytesPerSubmission
        : false;
  });
  const canSelectMoreFiles =
    items.length < props.maxFilesPerSubmission && selectableMimeTypes.length > 0;

  function updateItem(
    clientFileId: string,
    update: Partial<GuestFileRowModel>,
  ): void {
    setItems((current) =>
      current.map((item) =>
        item.clientFileId === clientFileId ? { ...item, ...update } : item,
      ),
    );
  }

  function selectFiles(files: FileList | null): void {
    if (!files || running || submissionId) {
      return;
    }

    setGlobalError(undefined);
    const selected = Array.from(files);
    const existingFingerprints = new Set(items.map((item) => fingerprint(item.file)));
    const additions: GuestFileRowModel[] = [];
    let imageBytes = selectedImageBytes;
    let totalBytes = items.reduce((total, item) => total + item.file.size, 0);
    let videoBytes = selectedVideoBytes;

    for (const file of selected) {
      if (items.length + additions.length >= props.maxFilesPerSubmission) {
        setGlobalError(`Choose no more than ${props.maxFilesPerSubmission} files.`);
        break;
      }

      if (existingFingerprints.has(fingerprint(file))) {
        continue;
      }

      const category = uploadFileCategoryForMimeType(file.type);

      if (!allowedMimeTypes.has(file.type) || !category) {
        setGlobalError(
          `${file.name} is not supported. Choose a JPEG, PNG, HEIC, MP4, or MOV file.`,
        );
        continue;
      }

      const maxFileSizeBytes =
        category === "VIDEO"
          ? props.maxVideoFileSizeBytes
          : props.maxImageFileSizeBytes;

      if (file.size <= 0 || file.size > maxFileSizeBytes) {
        setGlobalError(
          `${file.name} must be non-empty and no larger than ${formatBytes(maxFileSizeBytes)}.`,
        );
        continue;
      }

      if (
        category === "IMAGE" &&
        imageBytes + file.size > props.maxImageBytesPerSubmission
      ) {
        setGlobalError(
          `${file.name} exceeds the remaining ${formatBytes(props.maxImageBytesPerSubmission - imageBytes)} photo selection capacity.`,
        );
        continue;
      }

      if (
        category === "VIDEO" &&
        videoBytes + file.size > props.maxVideoBytesPerSubmission
      ) {
        setGlobalError(
          `${file.name} exceeds the remaining ${formatBytes(props.maxVideoBytesPerSubmission - videoBytes)} video selection capacity.`,
        );
        continue;
      }

      if (totalBytes + file.size > props.maxSubmissionBytes) {
        setGlobalError(
          `Selected files exceed the ${formatBytes(props.maxSubmissionBytes)} submission limit.`,
        );
        continue;
      }

      totalBytes += file.size;
      if (category === "IMAGE") {
        imageBytes += file.size;
      } else {
        videoBytes += file.size;
      }
      existingFingerprints.add(fingerprint(file));
      additions.push({
        clientFileId: newClientFileId(),
        confirmedBytes: 0,
        file,
        status: "READY",
      });
    }

    setItems((current) => [...current, ...additions]);
  }

  async function uploadOne(
    item: GuestFileRowModel,
    durableSubmissionId: string,
  ): Promise<boolean> {
    if (!item.fileId) {
      return false;
    }

    const controller = new AbortController();
    controllers.current.set(item.clientFileId, controller);
    cancelled.current.delete(item.clientFileId);
    updateItem(item.clientFileId, {
      error: undefined,
      status: "SESSION_READY",
    });

    try {
      await uploadFileToDrive({
        file: item.file,
        identity: {
          clientFileId: item.clientFileId,
          fileId: item.fileId,
          portalToken: props.portalToken,
          submissionId: durableSubmissionId,
        },
        onProgress: (progress) => {
          updateItem(item.clientFileId, {
            confirmedBytes: progress.confirmedBytes,
            status: progress.state as GuestFileStatus,
          });
        },
        signal: controller.signal,
      });
      updateItem(item.clientFileId, {
        confirmedBytes: item.file.size,
        error: undefined,
        status: "COMPLETED",
      });
      return true;
    } catch (error) {
      if (cancelled.current.has(item.clientFileId)) {
        updateItem(item.clientFileId, { error: undefined, status: "CANCELLED" });
        return false;
      }

      updateItem(item.clientFileId, {
        error:
          error instanceof BrowserUploadError || error instanceof Error
            ? error.message
            : "Upload failed.",
        status: "FAILED",
      });
      return false;
    } finally {
      controllers.current.delete(item.clientFileId);
    }
  }

  async function startUpload(): Promise<void> {
    if (items.length === 0 || running || submissionId) {
      return;
    }

    setRunning(true);
    setGlobalError(undefined);

    try {
      const response = await fetch("/api/submissions", {
        body: JSON.stringify({
          portalToken: props.portalToken,
          ...(guestName.trim() ? { guestName: guestName.trim() } : {}),
          files: items.map((item) => ({
            clientFileId: item.clientFileId,
            name: item.file.name,
            mimeType: item.file.type,
            sizeBytes: item.file.size,
          })),
        }),
        cache: "no-store",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });

      if (!response.ok) {
        setGlobalError(await responseError(response));
        return;
      }

      const submission = (await response.json()) as SubmissionResponse;
      const fileIds = new Map(
        submission.files.map((file) => [file.clientFileId, file.fileId]),
      );

      if (
        fileIds.size !== items.length ||
        items.some((item) => !fileIds.get(item.clientFileId))
      ) {
        setGlobalError("Upload service returned incomplete file records. Refresh before retrying.");
        return;
      }

      const durableItems = items.map((item) => ({
        ...item,
        fileId: fileIds.get(item.clientFileId),
        status: "QUEUED" as const,
      }));
      setSubmissionId(submission.submissionId);
      setReceiptId(submission.receiptId);
      setItems(durableItems);

      let cursor = 0;
      const workerCount = Math.min(props.concurrency, durableItems.length);

      async function worker() {
        while (cursor < durableItems.length) {
          const index = cursor;
          cursor += 1;
          await uploadOne(durableItems[index], submission.submissionId);
        }
      }

      await Promise.all(Array.from({ length: workerCount }, () => worker()));
    } catch {
      setGlobalError("Could not create the upload submission. Try again.");
    } finally {
      setRunning(false);
    }
  }

  async function cancelItem(item: GuestFileRowModel): Promise<void> {
    if (!item.fileId || !submissionId) {
      return;
    }

    cancelled.current.add(item.clientFileId);
    controllers.current.get(item.clientFileId)?.abort();
    updateItem(item.clientFileId, { error: undefined, status: "CANCELLED" });

    const identity: BrowserUploadIdentity = {
      clientFileId: item.clientFileId,
      fileId: item.fileId,
      portalToken: props.portalToken,
      submissionId,
    };

    try {
      await cancelDriveUpload(fetch, identity);
    } catch {
      updateItem(item.clientFileId, {
        error: "Cancellation could not be confirmed. Do not retry this file yet.",
      });
    }
  }

  async function retryItem(item: GuestFileRowModel): Promise<void> {
    if (!submissionId || running) {
      return;
    }

    await uploadOne(item, submissionId);
  }

  const completedCount = items.filter((item) => item.status === "COMPLETED").length;
  const terminalCount = items.filter((item) =>
    ["COMPLETED", "FAILED", "CANCELLED"].includes(item.status),
  ).length;
  const finished = Boolean(submissionId) && terminalCount === items.length;
  const aggregateProgress = getAggregateUploadProgress(
    items.map((item) => ({
      confirmedBytes: item.confirmedBytes,
      sizeBytes: item.file.size,
      status: item.status,
    })),
  );

  return (
    <section className="mt-8" aria-labelledby="guest-upload-heading">
      <h2 className="text-2xl font-semibold text-slate-950" id="guest-upload-heading">
        Add your files
      </h2>
      <p className="mt-2 text-sm leading-6 text-slate-600">
        Select up to {props.maxFilesPerSubmission} photos or videos. Each photo can be up to {" "}
        {formatBytes(props.maxImageFileSizeBytes)} and each video up to {" "}
        {formatBytes(props.maxVideoFileSizeBytes)}. Selection capacity is {" "}
        {formatBytes(props.maxImageBytesPerSubmission)} for photos and {" "}
        {formatBytes(props.maxVideoBytesPerSubmission)} for videos. Accepted formats: JPEG, PNG,
        HEIC, MP4, and MOV.
      </p>

      {!submissionId ? (
        <div className="mt-5 space-y-5">
          <div>
            <label className="block text-sm font-semibold text-slate-800" htmlFor="guest-name">
              Your name <span className="font-normal text-slate-500">(optional)</span>
            </label>
            <input
              className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-3"
              disabled={running}
              id="guest-name"
              maxLength={100}
              onChange={(event) => setGuestName(event.target.value)}
              value={guestName}
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-800" htmlFor="guest-files">
              Choose files
            </label>
            <input
              accept={selectableMimeTypes.join(",")}
              className="mt-2 block w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm file:mr-3 file:rounded-full file:border-0 file:bg-slate-950 file:px-4 file:py-2 file:font-semibold file:text-white"
              disabled={running || !canSelectMoreFiles}
              id="guest-files"
              multiple
              onChange={(event) => {
                selectFiles(event.target.files);
                event.target.value = "";
              }}
              type="file"
            />
          </div>
        </div>
      ) : null}

      {globalError ? (
        <p className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800" role="alert">
          {globalError}
        </p>
      ) : null}

      {items.length > 0 ? (
        <section
          aria-label="Selection capacity"
          className="mt-5 grid gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm sm:grid-cols-2"
        >
          <p className="text-slate-700">
            Photos: <strong>{formatBytes(selectedImageBytes)}</strong> / {" "}
            {formatBytes(props.maxImageBytesPerSubmission)} selected
          </p>
          <p className="text-slate-700">
            Videos: <strong>{formatBytes(selectedVideoBytes)}</strong> / {" "}
            {formatBytes(props.maxVideoBytesPerSubmission)} selected
          </p>
        </section>
      ) : null}

      {items.length > 0 ? (
        <section
          aria-label="Overall upload progress"
          aria-live="polite"
          className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4"
        >
          <div className="flex items-center justify-between gap-3 text-sm">
            <p className="font-semibold text-emerald-950">Upload progress</p>
            <p className="text-emerald-900">
              {aggregateProgress.completedFiles}/{aggregateProgress.totalFiles} files uploaded
            </p>
          </div>
          <progress
            aria-label={`${aggregateProgress.completedFiles} of ${aggregateProgress.totalFiles} files uploaded`}
            className="mt-3 h-3 w-full accent-emerald-700"
            max={aggregateProgress.totalBytes}
            value={aggregateProgress.confirmedBytes}
          />
        </section>
      ) : null}

      {items.length > 0 ? (
        <details className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
          <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-slate-900 marker:text-slate-500">
            File details
            <span className="ml-2 font-normal text-slate-600">
              ({items.length} {items.length === 1 ? "file" : "files"} selected)
            </span>
          </summary>
          <ul className="max-h-80 space-y-3 overflow-y-auto border-t border-slate-200 p-3">
            {items.map((item) => (
              <FileRow
                item={item}
                key={item.clientFileId}
                locked={Boolean(submissionId)}
                onCancel={() => void cancelItem(item)}
                onRemove={() =>
                  setItems((current) =>
                    current.filter((candidate) => candidate.clientFileId !== item.clientFileId),
                  )
                }
                onRetry={() => void retryItem(item)}
              />
            ))}
          </ul>
        </details>
      ) : null}

      {!submissionId && items.length > 0 ? (
        <button
          className="mt-6 min-h-12 rounded-full bg-emerald-800 px-6 font-semibold text-white disabled:opacity-60"
          disabled={running}
          onClick={() => void startUpload()}
          type="button"
        >
          {running ? "Preparing…" : `Upload ${items.length} file${items.length === 1 ? "" : "s"}`}
        </button>
      ) : null}

      {finished ? (
        <section className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-5" aria-live="polite">
          <h2 className="font-semibold text-emerald-950">
            {completedCount === items.length
              ? "All files delivered"
              : completedCount > 0
                ? "Some files delivered"
                : "No files were delivered"}
          </h2>
          <p className="mt-2 text-sm text-emerald-900">
            Provider-confirmed files: {completedCount} of {items.length}
          </p>
          <p className="mt-2 break-all text-xs text-emerald-800">Receipt: {receiptId}</p>
        </section>
      ) : null}
    </section>
  );
}
