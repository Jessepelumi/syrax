export const IMAGE_UPLOAD_MIME_TYPES = [
  "image/jpeg",
  "image/heic",
  "image/png",
] as const;

export const VIDEO_UPLOAD_MIME_TYPES = [
  "video/mp4",
  "video/quicktime",
] as const;

export const ALLOWED_UPLOAD_MIME_TYPES = [
  ...IMAGE_UPLOAD_MIME_TYPES,
  ...VIDEO_UPLOAD_MIME_TYPES,
] as const;

export type AllowedUploadMimeType = (typeof ALLOWED_UPLOAD_MIME_TYPES)[number];
export type UploadFileCategory = "IMAGE" | "VIDEO";

const EXTENSION_BY_MIME_TYPE: Record<AllowedUploadMimeType, string> = {
  "image/heic": "heic",
  "image/jpeg": "jpg",
  "image/png": "png",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
};

export function isAllowedUploadMimeType(value: string): value is AllowedUploadMimeType {
  return ALLOWED_UPLOAD_MIME_TYPES.some((mimeType) => mimeType === value);
}

export function uploadFileCategoryForMimeType(
  mimeType: string,
): UploadFileCategory | undefined {
  if (IMAGE_UPLOAD_MIME_TYPES.some((candidate) => candidate === mimeType)) {
    return "IMAGE";
  }

  if (VIDEO_UPLOAD_MIME_TYPES.some((candidate) => candidate === mimeType)) {
    return "VIDEO";
  }

  return undefined;
}

export function extensionForMimeType(mimeType: AllowedUploadMimeType): string {
  return EXTENSION_BY_MIME_TYPE[mimeType];
}
