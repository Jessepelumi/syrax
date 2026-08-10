import { z } from "zod";

const base64KeySchema = z.string().refine((value) => {
  if (!/^[A-Za-z0-9+/]{43}=$/.test(value)) {
    return false;
  }

  return Buffer.from(value, "base64").byteLength === 32;
}, "Must be a base64-encoded 32-byte key");

const positiveInteger = z.coerce
  .number()
  .int()
  .positive()
  .max(Number.MAX_SAFE_INTEGER);

export const environmentSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    APP_BASE_URL: z.url(),
    DATABASE_URL: z.string().refine(
      (value) => value.startsWith("postgresql://") || value.startsWith("postgres://"),
      "Must be a PostgreSQL connection URL",
    ),
    ADMIN_EMAIL: z
      .string()
      .trim()
      .pipe(z.email())
      .transform((value) => value.toLowerCase()),
    ADMIN_SESSION_SECRET: z.string().min(32),
    TOKEN_ENCRYPTION_KEY: base64KeySchema,
    GOOGLE_CLIENT_ID: z.string().min(1),
    GOOGLE_CLIENT_SECRET: z.string().min(1),
    GOOGLE_OAUTH_REDIRECT_URI: z.url(),
    GOOGLE_API_KEY: z.string().min(1),
    GOOGLE_CLOUD_PROJECT_NUMBER: z.string().regex(/^\d+$/),
    PILOT_DESTINATION_NAME: z.string().trim().min(1).max(255),
    DEFAULT_PORTAL_EXPIRY: z.iso.datetime({ offset: true }),
    MAX_FILE_SIZE_BYTES: positiveInteger,
    MAX_FILES_PER_SUBMISSION: positiveInteger,
    MAX_SUBMISSION_BYTES: positiveInteger,
    UPLOAD_CHUNK_SIZE_BYTES: positiveInteger.refine(
      (value) => value % (256 * 1024) === 0,
      "Must be a multiple of 256 KiB",
    ),
    UPLOAD_CLIENT_CONCURRENCY: positiveInteger.max(10),
    LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
    APP_VERSION: z.string().min(1).optional(),
    VERCEL_GIT_COMMIT_SHA: z.string().min(1).optional(),
  })
  .superRefine((environment, context) => {
    if (environment.MAX_SUBMISSION_BYTES < environment.MAX_FILE_SIZE_BYTES) {
      context.addIssue({
        code: "custom",
        path: ["MAX_SUBMISSION_BYTES"],
        message: "Must be at least MAX_FILE_SIZE_BYTES",
      });
    }
  });

export type Environment = z.infer<typeof environmentSchema>;

let cachedEnvironment: Environment | undefined;

export function parseEnvironment(input: NodeJS.ProcessEnv | Record<string, unknown>): Environment {
  return environmentSchema.parse(input);
}

export function getEnvironment(): Environment {
  cachedEnvironment ??= parseEnvironment(process.env);
  return cachedEnvironment;
}

export function getDatabaseUrl(): string {
  const result = environmentSchema.shape.DATABASE_URL.safeParse(process.env.DATABASE_URL);

  if (!result.success) {
    throw new Error("DATABASE_URL is missing or invalid");
  }

  return result.data;
}

export function getApplicationVersion(): string {
  const environment = getEnvironment();
  return environment.APP_VERSION ?? environment.VERCEL_GIT_COMMIT_SHA ?? "local";
}

export function isNodeRuntime(): boolean {
  return process.env.NEXT_RUNTIME !== "edge";
}
