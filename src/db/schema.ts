import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const driveConnectionStatus = pgEnum("drive_connection_status", [
  "ACTIVE",
  "REVOKED",
  "ERROR",
]);

export const driveDestinationStatus = pgEnum("drive_destination_status", [
  "ACTIVE",
  "INVALID",
  "DISCONNECTED",
]);

export const auditActorType = pgEnum("audit_actor_type", ["ADMIN", "GUEST", "SYSTEM"]);

export const portalStatus = pgEnum("portal_status", [
  "DRAFT",
  "OPEN",
  "CLOSED",
  "EXPIRED",
]);

export const submissionStatus = pgEnum("submission_status", [
  "CREATED",
  "UPLOADING",
  "VERIFYING",
  "COMPLETED",
  "PARTIAL",
  "FAILED",
  "EXPIRED",
]);

export const uploadFileState = pgEnum("upload_file_state", [
  "CREATED",
  "SESSION_READY",
  "UPLOADING",
  "RETRY_WAIT",
  "VERIFYING",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
  "EXPIRED",
]);

export const admins = pgTable(
  "admins",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    googleSubject: text("google_subject").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("admins_email_unique").on(table.email),
    uniqueIndex("admins_google_subject_unique").on(table.googleSubject),
  ],
);

export const driveConnections = pgTable(
  "drive_connections",
  {
    id: text("id").primaryKey(),
    adminId: text("admin_id")
      .notNull()
      .references(() => admins.id, { onDelete: "cascade" }),
    encryptedRefreshToken: text("encrypted_refresh_token").notNull(),
    grantedScopes: text("granted_scopes").array().notNull(),
    tokenVersion: text("token_version").notNull().default("v1"),
    status: driveConnectionStatus("status").notNull().default("ACTIVE"),
    lastVerifiedAt: timestamp("last_verified_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("drive_connections_admin_unique").on(table.adminId)],
);

export const driveDestinations = pgTable(
  "drive_destinations",
  {
    id: text("id").primaryKey(),
    driveConnectionId: text("drive_connection_id")
      .notNull()
      .references(() => driveConnections.id, { onDelete: "cascade" }),
    providerFolderId: text("provider_folder_id").notNull(),
    displayName: text("display_name").notNull(),
    verifiedAt: timestamp("verified_at", { withTimezone: true }).notNull(),
    status: driveDestinationStatus("status").notNull().default("ACTIVE"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("drive_destinations_connection_folder_unique").on(
      table.driveConnectionId,
      table.providerFolderId,
    ),
    index("drive_destinations_connection_updated_idx").on(
      table.driveConnectionId,
      table.updatedAt,
    ),
  ],
);

export const portals = pgTable(
  "portals",
  {
    id: text("id").primaryKey(),
    destinationId: text("destination_id")
      .notNull()
      .references(() => driveDestinations.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    publicTokenHash: text("public_token_hash").notNull(),
    status: portalStatus("status").notNull().default("DRAFT"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    allowedMimeTypes: text("allowed_mime_types").array().notNull(),
    maxFileSizeBytes: bigint("max_file_size_bytes", { mode: "number" }).notNull(),
    maxFilesPerSubmission: integer("max_files_per_submission").notNull(),
    maxSubmissionBytes: bigint("max_submission_bytes", { mode: "number" }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("portals_public_token_hash_unique").on(table.publicTokenHash),
    index("portals_destination_created_idx").on(table.destinationId, table.createdAt),
    index("portals_status_expires_idx").on(table.status, table.expiresAt),
    check("portals_allowed_mime_types_nonempty", sql`cardinality(${table.allowedMimeTypes}) > 0`),
    check("portals_max_file_size_positive", sql`${table.maxFileSizeBytes} > 0`),
    check(
      "portals_max_files_per_submission_positive",
      sql`${table.maxFilesPerSubmission} > 0`,
    ),
    check(
      "portals_max_submission_size_valid",
      sql`${table.maxSubmissionBytes} >= ${table.maxFileSizeBytes}`,
    ),
  ],
);

export const submissions = pgTable(
  "submissions",
  {
    id: text("id").primaryKey(),
    portalId: text("portal_id")
      .notNull()
      .references(() => portals.id, { onDelete: "restrict" }),
    status: submissionStatus("status").notNull().default("CREATED"),
    guestName: text("guest_name"),
    fileCount: integer("file_count").notNull(),
    totalDeclaredBytes: bigint("total_declared_bytes", { mode: "number" }).notNull(),
    completedFiles: integer("completed_files").notNull().default(0),
    version: integer("version").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    index("submissions_portal_created_idx").on(table.portalId, table.createdAt),
    index("submissions_status_updated_idx").on(table.status, table.updatedAt),
    check("submissions_file_count_positive", sql`${table.fileCount} > 0`),
    check("submissions_total_declared_bytes_positive", sql`${table.totalDeclaredBytes} > 0`),
    check("submissions_completed_files_nonnegative", sql`${table.completedFiles} >= 0`),
    check(
      "submissions_completed_files_within_count",
      sql`${table.completedFiles} <= ${table.fileCount}`,
    ),
    check("submissions_version_nonnegative", sql`${table.version} >= 0`),
  ],
);

export const uploadFiles = pgTable(
  "upload_files",
  {
    id: text("id").primaryKey(),
    submissionId: text("submission_id")
      .notNull()
      .references(() => submissions.id, { onDelete: "cascade" }),
    clientFileId: text("client_file_id").notNull(),
    originalName: text("original_name").notNull(),
    destinationName: text("destination_name").notNull(),
    declaredMimeType: text("declared_mime_type").notNull(),
    declaredSizeBytes: bigint("declared_size_bytes", { mode: "number" }).notNull(),
    state: uploadFileState("state").notNull().default("CREATED"),
    providerFileId: text("provider_file_id"),
    encryptedProviderSessionRef: text("provider_session_ref"),
    providerSessionExpiresAt: timestamp("provider_session_expires_at", {
      withTimezone: true,
    }),
    sessionCreationLease: text("session_creation_lease"),
    sessionCreationLeaseExpiresAt: timestamp("session_creation_lease_expires_at", {
      withTimezone: true,
    }),
    bytesConfirmed: bigint("bytes_confirmed", { mode: "number" }).notNull().default(0),
    attemptCount: integer("attempt_count").notNull().default(0),
    lastErrorCode: text("last_error_code"),
    version: integer("version").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("upload_files_submission_client_unique").on(
      table.submissionId,
      table.clientFileId,
    ),
    uniqueIndex("upload_files_destination_name_unique").on(table.destinationName),
    uniqueIndex("upload_files_provider_file_unique").on(table.providerFileId),
    index("upload_files_submission_state_idx").on(table.submissionId, table.state),
    index("upload_files_session_lease_expiry_idx").on(
      table.sessionCreationLeaseExpiresAt,
    ),
    check("upload_files_declared_size_positive", sql`${table.declaredSizeBytes} > 0`),
    check("upload_files_bytes_confirmed_nonnegative", sql`${table.bytesConfirmed} >= 0`),
    check(
      "upload_files_bytes_confirmed_within_size",
      sql`${table.bytesConfirmed} <= ${table.declaredSizeBytes}`,
    ),
    check("upload_files_attempt_count_nonnegative", sql`${table.attemptCount} >= 0`),
    check("upload_files_version_nonnegative", sql`${table.version} >= 0`),
  ],
);

export const auditEvents = pgTable(
  "audit_events",
  {
    id: text("id").primaryKey(),
    actorType: auditActorType("actor_type").notNull(),
    actorId: text("actor_id"),
    eventType: text("event_type").notNull(),
    resourceType: text("resource_type").notNull(),
    resourceId: text("resource_id").notNull(),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .default(sql`'{}'::jsonb`)
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("audit_events_resource_created_idx").on(
      table.resourceType,
      table.resourceId,
      table.createdAt,
    ),
    index("audit_events_type_created_idx").on(table.eventType, table.createdAt),
  ],
);

export type Admin = typeof admins.$inferSelect;
export type DriveConnection = typeof driveConnections.$inferSelect;
export type DriveDestination = typeof driveDestinations.$inferSelect;
export type Portal = typeof portals.$inferSelect;
export type Submission = typeof submissions.$inferSelect;
export type UploadFile = typeof uploadFiles.$inferSelect;
