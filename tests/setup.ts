import { randomBytes } from "node:crypto";

process.env.DB_DRIVER = "pglite";
process.env.PGLITE_DIR = "memory://";
// Generated per test process: no credential-shaped literal is committed.
process.env.AUTH_SECRET = process.env.AUTH_SECRET ?? randomBytes(48).toString("base64");
process.env.PAYMENT_PROVIDER = "mock";
process.env.EMAIL_PROVIDER = "log";
process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
process.env.WEBHOOK_ENCRYPTION_KEY = process.env.WEBHOOK_ENCRYPTION_KEY ?? randomBytes(32).toString("base64");
