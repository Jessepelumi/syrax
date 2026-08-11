import "server-only";

import {
  extensionForMimeType,
  type AllowedUploadMimeType,
} from "@/lib/mime";

const BIDI_CONTROL_CHARACTERS = /[\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/g;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f-\u009f]/g;
const PATH_SEPARATORS = /[\\/]+/g;
const UNSAFE_NAME_CHARACTERS = /[^\p{L}\p{N} ._()-]+/gu;
const REPEATED_WHITESPACE = /\s+/g;
const MAX_ORIGINAL_NAME_LENGTH = 180;
const MAX_DESTINATION_NAME_LENGTH = 240;

function trimUnsafeEdges(value: string): string {
  return value.replace(/^[ ._-]+|[ ._-]+$/g, "");
}

function truncateCodePoints(value: string, maximumLength: number): string {
  return Array.from(value).slice(0, maximumLength).join("");
}

function stableShortId(value: string): string {
  const suffix = value.includes("_") ? value.slice(value.indexOf("_") + 1) : value;
  const safe = suffix.replace(/[^A-Za-z0-9]/g, "");

  return (safe || "unknown").slice(0, 8).toLowerCase();
}

function utcDateStamp(value: Date): string {
  const year = value.getUTCFullYear().toString().padStart(4, "0");
  const month = (value.getUTCMonth() + 1).toString().padStart(2, "0");
  const day = value.getUTCDate().toString().padStart(2, "0");

  return `${year}${month}${day}`;
}

export function sanitizeOriginalFileName(value: string): string {
  const normalized = value
    .normalize("NFKC")
    .replace(BIDI_CONTROL_CHARACTERS, "")
    .replace(CONTROL_CHARACTERS, "")
    .replace(PATH_SEPARATORS, "_")
    .replace(UNSAFE_NAME_CHARACTERS, "_")
    .replace(REPEATED_WHITESPACE, " ");
  const safe = trimUnsafeEdges(normalized);

  return truncateCodePoints(safe || "upload", MAX_ORIGINAL_NAME_LENGTH);
}

export function createDestinationFileName(input: {
  fileId: string;
  mimeType: AllowedUploadMimeType;
  originalName: string;
  submissionId: string;
  uploadedAt: Date;
}): { destinationName: string; sanitizedOriginalName: string } {
  const sanitizedOriginalName = sanitizeOriginalFileName(input.originalName);
  const extension = extensionForMimeType(input.mimeType);
  const finalDot = sanitizedOriginalName.lastIndexOf(".");
  const withoutExtension = finalDot > 0
    ? sanitizedOriginalName.slice(0, finalDot)
    : sanitizedOriginalName;
  const safeStem = trimUnsafeEdges(withoutExtension) || "upload";
  const prefix = `${utcDateStamp(input.uploadedAt)}_${stableShortId(input.submissionId)}_${stableShortId(input.fileId)}_`;
  const maximumStemLength = MAX_DESTINATION_NAME_LENGTH - prefix.length - extension.length - 1;
  const stem = truncateCodePoints(safeStem, maximumStemLength);

  return {
    destinationName: `${prefix}${stem}.${extension}`,
    sanitizedOriginalName,
  };
}
