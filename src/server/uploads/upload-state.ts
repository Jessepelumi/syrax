import "server-only";

export const UPLOAD_FILE_STATES = [
  "CREATED",
  "SESSION_READY",
  "UPLOADING",
  "RETRY_WAIT",
  "VERIFYING",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
  "EXPIRED",
] as const;

export type UploadFileState = (typeof UPLOAD_FILE_STATES)[number];

export const TERMINAL_UPLOAD_FILE_STATES = [
  "COMPLETED",
  "FAILED",
  "CANCELLED",
  "EXPIRED",
] as const satisfies readonly UploadFileState[];

const UPLOAD_FILE_TRANSITIONS: Record<UploadFileState, readonly UploadFileState[]> = {
  CREATED: ["SESSION_READY", "FAILED", "CANCELLED", "EXPIRED"],
  SESSION_READY: ["UPLOADING", "FAILED", "CANCELLED", "EXPIRED"],
  UPLOADING: ["RETRY_WAIT", "VERIFYING", "FAILED", "CANCELLED", "EXPIRED"],
  RETRY_WAIT: ["UPLOADING", "FAILED", "CANCELLED", "EXPIRED"],
  VERIFYING: ["COMPLETED", "FAILED", "EXPIRED"],
  COMPLETED: [],
  FAILED: [],
  CANCELLED: [],
  EXPIRED: [],
};

export type SubmissionAggregateStatus =
  | "CREATED"
  | "UPLOADING"
  | "VERIFYING"
  | "COMPLETED"
  | "PARTIAL"
  | "FAILED";

export class UploadStateTransitionError extends Error {
  constructor(
    readonly from: UploadFileState,
    readonly to: UploadFileState,
  ) {
    super(`Upload file cannot transition from ${from} to ${to}`);
    this.name = "UploadStateTransitionError";
  }
}

export function isTerminalUploadState(state: UploadFileState): boolean {
  return TERMINAL_UPLOAD_FILE_STATES.some((terminal) => terminal === state);
}

export function canTransitionUploadFile(
  from: UploadFileState,
  to: UploadFileState,
): boolean {
  return UPLOAD_FILE_TRANSITIONS[from].includes(to);
}

export function assertUploadFileTransition(
  from: UploadFileState,
  to: UploadFileState,
): void {
  if (!canTransitionUploadFile(from, to)) {
    throw new UploadStateTransitionError(from, to);
  }
}

export function deriveSubmissionStatus(
  fileStates: readonly UploadFileState[],
): SubmissionAggregateStatus {
  if (fileStates.length === 0 || fileStates.every((state) => state === "CREATED")) {
    return "CREATED";
  }

  if (fileStates.every((state) => state === "COMPLETED")) {
    return "COMPLETED";
  }

  if (fileStates.every(isTerminalUploadState)) {
    return fileStates.some((state) => state === "COMPLETED") ? "PARTIAL" : "FAILED";
  }

  if (fileStates.some((state) => state === "VERIFYING")) {
    return "VERIFYING";
  }

  return "UPLOADING";
}
