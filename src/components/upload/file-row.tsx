"use client";

export type GuestFileStatus =
  | "READY"
  | "QUEUED"
  | "SESSION_READY"
  | "UPLOADING"
  | "RETRY_WAIT"
  | "VERIFYING"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED";

export interface GuestFileRowModel {
  clientFileId: string;
  confirmedBytes: number;
  error?: string;
  file: File;
  fileId?: string;
  status: GuestFileStatus;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) {
    return `${Math.ceil(bytes / 1024)} KiB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}

function statusLabel(status: GuestFileStatus): string {
  const labels: Record<GuestFileStatus, string> = {
    READY: "Ready",
    QUEUED: "Queued",
    SESSION_READY: "Preparing",
    UPLOADING: "Uploading",
    RETRY_WAIT: "Waiting to retry",
    VERIFYING: "Verifying",
    COMPLETED: "Complete",
    FAILED: "Needs attention",
    CANCELLED: "Cancelled",
  };

  return labels[status];
}

export function FileRow({
  item,
  locked,
  onCancel,
  onRemove,
  onRetry,
}: {
  item: GuestFileRowModel;
  locked: boolean;
  onCancel: () => void;
  onRemove: () => void;
  onRetry: () => void;
}) {
  const cancellable = ["SESSION_READY", "UPLOADING", "RETRY_WAIT"].includes(
    item.status,
  );

  return (
    <li className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="min-w-0">
        <p className="truncate font-semibold text-slate-950">{item.file.name}</p>
        <p className="mt-1 text-xs text-slate-500">
          {formatBytes(item.file.size)} · {statusLabel(item.status)}
          {item.status === "COMPLETED" ? " ✓" : ""}
        </p>
      </div>

      {item.error ? (
        <p className="mt-2 text-sm text-red-700" role="alert">
          {item.error}
        </p>
      ) : null}

      <div className="mt-3 flex gap-4 text-sm">
        {!locked && item.status === "READY" ? (
          <button className="font-semibold text-red-700 underline" onClick={onRemove} type="button">
            Remove
          </button>
        ) : null}
        {cancellable ? (
          <button className="font-semibold text-red-700 underline" onClick={onCancel} type="button">
            Cancel
          </button>
        ) : null}
        {item.status === "FAILED" ? (
          <button className="font-semibold text-emerald-800 underline" onClick={onRetry} type="button">
            Retry
          </button>
        ) : null}
      </div>
    </li>
  );
}
