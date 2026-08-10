import "server-only";

export class RequestBodyError extends Error {
  constructor(readonly code: "INVALID_JSON" | "REQUEST_TOO_LARGE") {
    super(code);
    this.name = "RequestBodyError";
  }
}

export function hasJsonContentType(request: Request): boolean {
  const contentType = request.headers.get("content-type");

  return contentType?.split(";", 1)[0]?.trim().toLowerCase() === "application/json";
}

export async function readJsonBody(
  request: Request,
  maximumBytes: number,
): Promise<unknown> {
  const declaredLength = request.headers.get("content-length");

  if (declaredLength) {
    const parsedLength = Number(declaredLength);

    if (Number.isFinite(parsedLength) && parsedLength > maximumBytes) {
      throw new RequestBodyError("REQUEST_TOO_LARGE");
    }
  }

  if (!request.body) {
    throw new RequestBodyError("INVALID_JSON");
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    totalBytes += value.byteLength;

    if (totalBytes > maximumBytes) {
      await reader.cancel();
      throw new RequestBodyError("REQUEST_TOO_LARGE");
    }

    chunks.push(value);
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;

  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return JSON.parse(new TextDecoder().decode(body)) as unknown;
  } catch {
    throw new RequestBodyError("INVALID_JSON");
  }
}
