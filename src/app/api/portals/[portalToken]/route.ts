import { errorResponse } from "@/lib/errors";
import { newId } from "@/lib/ids";
import { getLogger } from "@/lib/logger";
import { resolvePublicPortal } from "@/server/portals/portal-service";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ portalToken: string }> },
): Promise<Response> {
  const requestId = newId("req");
  const { portalToken } = await context.params;
  let portal: Awaited<ReturnType<typeof resolvePublicPortal>>;

  try {
    portal = await resolvePublicPortal(portalToken);
  } catch (error) {
    getLogger().error({
      event: "portal.resolve_failed",
      requestId,
      errorType: error instanceof Error ? error.name : "UnknownError",
    });

    return errorResponse({
      code: "INTERNAL_ERROR",
      message: "The upload link could not be checked.",
      requestId,
      retryable: true,
      status: 500,
    });
  }

  if (!portal) {
    return errorResponse({
      code: "PORTAL_NOT_FOUND",
      message: "This upload link is invalid.",
      requestId,
      status: 404,
    });
  }

  if (!portal.destinationAvailable && portal.status === "OPEN") {
    return errorResponse({
      code: "DESTINATION_UNAVAILABLE",
      message: "Uploads are temporarily unavailable. Contact the host.",
      requestId,
      retryable: true,
      status: 503,
    });
  }

  return Response.json(
    {
      name: portal.name,
      status: portal.status,
      expiresAt: portal.expiresAt.toISOString(),
      allowedMimeTypes: portal.allowedMimeTypes,
      maxFileSizeBytes: portal.maxFileSizeBytes,
      maxFilesPerSubmission: portal.maxFilesPerSubmission,
      maxSubmissionBytes: portal.maxSubmissionBytes,
    },
    {
      headers: {
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
        "X-Request-Id": requestId,
      },
    },
  );
}
