import { sql } from "drizzle-orm";
import {
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
    uniqueIndex("drive_destinations_connection_unique").on(table.driveConnectionId),
  ],
);

export const auditEvents = pgTable("audit_events", {
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
});

export type Admin = typeof admins.$inferSelect;
export type DriveConnection = typeof driveConnections.$inferSelect;
export type DriveDestination = typeof driveDestinations.$inferSelect;
