import "server-only";

import type { NextRequest } from "next/server";

import { getEnvironment } from "@/lib/env";

export function hasExpectedOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");

  if (!origin) {
    return false;
  }

  return origin === new URL(getEnvironment().APP_BASE_URL).origin;
}
