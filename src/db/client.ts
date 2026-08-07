import "server-only";

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "@/db/schema";
import { getDatabaseUrl } from "@/lib/env";

const globalDatabase = globalThis as typeof globalThis & {
  syraxPostgresClient?: ReturnType<typeof postgres>;
};

export function getPostgresClient(): ReturnType<typeof postgres> {
  globalDatabase.syraxPostgresClient ??= postgres(getDatabaseUrl(), {
    connect_timeout: 10,
    idle_timeout: 20,
    max: 5,
    prepare: false,
  });

  return globalDatabase.syraxPostgresClient;
}

export function getDatabase() {
  return drizzle(getPostgresClient(), { schema });
}

export async function checkDatabaseHealth(): Promise<void> {
  await getPostgresClient().unsafe("select 1 as ok");
}
