import path from "node:path";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { migrate as migratePostgres } from "drizzle-orm/postgres-js/migrator";
import type { Database } from "./client";
import { env } from "@/lib/env";

const migrationsFolder = path.join(process.cwd(), "db", "migrations");

/**
 * Applies all pending SQL migrations. Safe to call repeatedly: Drizzle records
 * applied migrations in `drizzle.__drizzle_migrations`.
 */
export async function runMigrations(database: Database): Promise<void> {
  if (env.dbDriver === "postgres") {
    await migratePostgres(database, { migrationsFolder });
  } else {
    await migratePglite(database as never, { migrationsFolder });
  }
}
