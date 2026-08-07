import { checkDatabaseHealth } from "@/db/client";
import { getApplicationVersion } from "@/lib/env";
import { newId } from "@/lib/ids";
import { getLogger } from "@/lib/logger";

export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  const requestId = newId("req");

  try {
    await checkDatabaseHealth();

    return Response.json(
      {
        status: "ok",
        database: "ok",
        version: getApplicationVersion(),
      },
      { headers: { "Cache-Control": "no-store", "X-Request-Id": requestId } },
    );
  } catch (error) {
    getLogger().error(
      {
        event: "health.database.failed",
        requestId,
        errorType: error instanceof Error ? error.name : "UnknownError",
      },
      "Database health check failed",
    );

    return Response.json(
      {
        status: "degraded",
        database: "error",
        version: getApplicationVersion(),
      },
      {
        status: 503,
        headers: { "Cache-Control": "no-store", "X-Request-Id": requestId },
      },
    );
  }
}
