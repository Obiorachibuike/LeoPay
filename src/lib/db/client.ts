/**
 * Database client — PostgreSQL.
 *
 * The application, the migrations and the test suite all run on PostgreSQL.
 * `postgres` (postgres.js) is the driver: it pools connections, streams
 * results and works unchanged against a local server, Neon, Supabase, RDS or
 * Cloud SQL. `prepare: false` keeps it compatible with transaction-mode
 * poolers (PgBouncer/Supavisor).
 *
 * `pglite` is a WASM build of PostgreSQL that we keep **only** as an explicit
 * opt-in for test runs on machines without a server (`DB_DRIVER=pglite`). It is
 * refused in production by `validateRuntimeConfig()`, and it is not the default
 * anywhere.
 */
import { drizzle as drizzlePostgres, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import postgres from "postgres";
import { mkdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import * as schema from "./schema";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

export type Database = PostgresJsDatabase<typeof schema>;

type GlobalDb = typeof globalThis & {
  __leopayDb?: Database;
  __leopayPglite?: PGlite;
  __leopayPg?: ReturnType<typeof postgres>;
};

const g = globalThis as GlobalDb;

/** Host/database without credentials, for logs and the health endpoint. */
export function describeDatabase(): { driver: "postgres" | "pglite"; target: string } {
  if (env.dbDriver === "pglite") {
    return { driver: "pglite", target: env.pgliteDir };
  }
  try {
    const url = new URL(env.databaseUrl);
    const database = url.pathname.replace(/^\//, "") || "(default)";
    return { driver: "postgres", target: `${url.hostname}:${url.port || "5432"}/${database}` };
  } catch {
    return { driver: "postgres", target: "(unparseable DATABASE_URL)" };
  }
}

function createPglite(dir: string): PGlite {
  // memory:// gives an isolated, disposable database for tests.
  if (dir.startsWith("memory://")) return new PGlite("memory://");
  mkdirSync(dir, { recursive: true });
  return new PGlite(dir);
}

function createDb(): Database {
  if (env.dbDriver === "pglite") {
    const pglite = createPglite(env.pgliteDir);
    g.__leopayPglite = pglite;
    logger.warn("Using embedded PGlite — test only, never for a running application");
    return drizzlePglite(pglite, { schema, casing: "snake_case" }) as unknown as Database;
  }

  if (!env.databaseUrl) {
    throw new Error(
      "DATABASE_URL is not set. LeoPay runs on PostgreSQL — start a server (see docker-compose.yml) " +
        "and point DATABASE_URL at it, e.g. postgresql://leopay@localhost:5432/leopay",
    );
  }

  const client = postgres(env.databaseUrl, {
    max: env.databasePoolMax,
    idle_timeout: 20,
    connect_timeout: 10,
    // Required for transaction-mode poolers (PgBouncer, Supabase, Neon).
    prepare: false,
    onnotice: () => {},
  });
  g.__leopayPg = client;
  return drizzlePostgres(client, { schema, casing: "snake_case" });
}

export const db: Database = g.__leopayDb ?? (g.__leopayDb = createDb());

/** Runs `fn` inside a transaction; rolls back on throw. */
export async function transaction<T>(fn: (tx: Database) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => fn(tx as unknown as Database));
}

/** Closes pooled connections. Tests and CLI scripts call this before exiting. */
export async function closeDb(): Promise<void> {
  await g.__leopayPg?.end({ timeout: 5 });
  await g.__leopayPglite?.close();
  delete g.__leopayDb;
  delete g.__leopayPglite;
  delete g.__leopayPg;
}
