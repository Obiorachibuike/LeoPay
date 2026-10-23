/**
 * Database client.
 *
 * Production uses `postgres` (node-postgres successor, pooling) against a real
 * PostgreSQL server via DATABASE_URL. Local development and the automated test
 * suite use @electric-sql/pglite, a WASM build of PostgreSQL that speaks the
 * same SQL, so migrations and queries are identical in both environments.
 *
 * Both drivers are exposed through one Drizzle instance type.
 */
import { drizzle as drizzlePostgres, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import postgres from "postgres";
import { mkdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import * as schema from "./schema";
import { env } from "@/lib/env";

export type Database = PostgresJsDatabase<typeof schema>;

type GlobalDb = typeof globalThis & {
  __leopayDb?: Database;
  __leopayPglite?: PGlite;
  __leopayPg?: ReturnType<typeof postgres>;
};

const g = globalThis as GlobalDb;

function createPglite(dir: string): PGlite {
  // memory:// gives an isolated, disposable database for tests.
  if (dir === "memory://" || dir.startsWith("memory://")) return new PGlite("memory://");
  mkdirSync(dir, { recursive: true });
  return new PGlite(dir);
}

function createDb(): Database {
  if (env.dbDriver === "postgres") {
    if (!env.databaseUrl) {
      throw new Error("DB_DRIVER=postgres requires DATABASE_URL to be set");
    }
    const client = postgres(env.databaseUrl, {
      max: Number(process.env.DATABASE_POOL_MAX ?? 10),
      idle_timeout: 20,
      // Supabase/Neon/PgBouncer transaction pooling needs this disabled.
      prepare: false,
      onnotice: () => {},
    });
    g.__leopayPg = client;
    return drizzlePostgres(client, { schema, casing: "snake_case" });
  }

  const pglite = createPglite(env.dbDriver === "pglite" ? env.pgliteDir : "memory://");
  g.__leopayPglite = pglite;
  return drizzlePglite(pglite, { schema, casing: "snake_case" }) as unknown as Database;
}

export const db: Database = g.__leopayDb ?? (g.__leopayDb = createDb());

export const rawPglite: PGlite | undefined = g.__leopayPglite;

/** Runs `fn` inside a transaction; rolls back on throw. */
export async function transaction<T>(fn: (tx: Database) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => fn(tx as unknown as Database));
}

/** Convenience for tests: close pooled connections. */
export async function closeDb(): Promise<void> {
  await g.__leopayPg?.end({ timeout: 5 });
  await g.__leopayPglite?.close();
  delete g.__leopayDb;
  delete g.__leopayPglite;
  delete g.__leopayPg;
}
