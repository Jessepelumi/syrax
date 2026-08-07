import "server-only";

import path from "node:path";

import { migrate } from "drizzle-orm/postgres-js/migrator";

import { getDatabase } from "@/db/client";

export async function migrateDatabase(): Promise<void> {
  await migrate(getDatabase(), {
    migrationsFolder: path.join(process.cwd(), "drizzle"),
  });
}
