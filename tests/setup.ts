import "../scripts/load-env";
import { randomBytes } from "node:crypto";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Test configuration.
 *
 * Tests run against PostgreSQL. Point `TEST_DATABASE_URL` at an empty database
 * on a real server (docker-compose.yml provides one):
 *
 *   TEST_DATABASE_URL=postgresql://leopay@localhost:5432/leopay_test npm test
 *
 * Every test truncates the tables it uses, so never point this at a database
 * you care about. When `TEST_DATABASE_URL` is absent the suite falls back to
 * PGlite (PostgreSQL compiled to WASM) so `npm test` still works without a
 * server; that fallback is test-only and is never used by the application.
 */
const testDatabaseUrl = process.env.TEST_DATABASE_URL?.trim();

if (testDatabaseUrl) {
  if (!/^(postgres|postgresql):\/\//.test(testDatabaseUrl)) {
    throw new Error("TEST_DATABASE_URL must be a postgresql:// connection string");
  }
  // The suite truncates every table it touches. Refuse an obviously
  // non-disposable database unless someone insists explicitly.
  const databaseName = new URL(testDatabaseUrl).pathname.replace(/^\//, "");
  if (!/test/i.test(databaseName) && process.env.ALLOW_NON_TEST_DATABASE !== "1") {
    throw new Error(
      `Refusing to run destructive tests against "${databaseName}": the database name must contain "test" ` +
        "(or set ALLOW_NON_TEST_DATABASE=1 deliberately).",
    );
  }
  process.env.DB_DRIVER = "postgres";
  process.env.DATABASE_URL = testDatabaseUrl;
  console.info(`[tests] PostgreSQL: ${new URL(testDatabaseUrl).host}`);
} else {
  process.env.DB_DRIVER = "pglite";
  process.env.PGLITE_DIR = "memory://";
  console.info("[tests] TEST_DATABASE_URL is not set — falling back to in-memory PGlite");
}

// Generated per test process: no credential-shaped literal is committed.
process.env.AUTH_SECRET = process.env.AUTH_SECRET ?? randomBytes(48).toString("base64");
process.env.PAYMENT_PROVIDER = "mock";
process.env.EMAIL_PROVIDER = "log";
process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
// Uploads are written to a throwaway directory so tests never touch .data.
process.env.UPLOAD_DIR = mkdtempSync(path.join(os.tmpdir(), "leopay-uploads-"));
process.env.WEBHOOK_ENCRYPTION_KEY =
  process.env.WEBHOOK_ENCRYPTION_KEY ?? randomBytes(32).toString("base64");
