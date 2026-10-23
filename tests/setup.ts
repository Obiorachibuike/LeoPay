import { randomBytes } from "node:crypto";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.DB_DRIVER = "pglite";
process.env.PGLITE_DIR = "memory://";
// Generated per test process: no credential-shaped literal is committed.
process.env.AUTH_SECRET = process.env.AUTH_SECRET ?? randomBytes(48).toString("base64");
process.env.PAYMENT_PROVIDER = "mock";
process.env.EMAIL_PROVIDER = "log";
process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
// Uploads are written to a throwaway directory so tests never touch .data.
process.env.UPLOAD_DIR = mkdtempSync(path.join(os.tmpdir(), "leopay-uploads-"));
process.env.WEBHOOK_ENCRYPTION_KEY =
  process.env.WEBHOOK_ENCRYPTION_KEY ?? randomBytes(32).toString("base64");
