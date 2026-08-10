export const PILOT_ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/heic",
  "image/png",
] as const;

export type PilotAllowedMimeType = (typeof PILOT_ALLOWED_MIME_TYPES)[number];

const EXTENSION_BY_MIME_TYPE: Record<PilotAllowedMimeType, string> = {
  "image/heic": "heic",
  "image/jpeg": "jpg",
  "image/png": "png",
};

export function isPilotAllowedMimeType(value: string): value is PilotAllowedMimeType {
  return PILOT_ALLOWED_MIME_TYPES.some((mimeType) => mimeType === value);
}

export function extensionForMimeType(mimeType: PilotAllowedMimeType): string {
  return EXTENSION_BY_MIME_TYPE[mimeType];
}
