import "server-only";

import pino from "pino";

import { getEnvironment } from "@/lib/env";

let logger: pino.Logger | undefined;

export function getLogger(): pino.Logger {
  logger ??= pino({
    base: undefined,
    level: getEnvironment().LOG_LEVEL,
    redact: {
      paths: [
        "authorization",
        "cookie",
        "accessToken",
        "refreshToken",
        "encryptedRefreshToken",
        "providerSessionRef",
        "sessionUrl",
        "req.headers.authorization",
        "req.headers.cookie",
        "response.config.headers.Authorization",
      ],
      censor: "[REDACTED]",
    },
  });

  return logger;
}
