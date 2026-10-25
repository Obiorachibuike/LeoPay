/**
 * Server environment configuration.
 *
 * Values are read once per process. Production safety checks are enforced by
 * `validateRuntimeConfig()` which is called from `instrumentation.ts` at boot.
 */
const bool = (v: string | undefined, fallback = false) =>
  v === undefined ? fallback : ["1", "true", "yes", "on"].includes(v.toLowerCase());

const isProduction = process.env.NODE_ENV === "production";

/** Base URL used for links in emails, redirects and webhook docs. */
function resolveAppUrl(): string {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  isProduction,
  isTest: process.env.NODE_ENV === "test" || process.env.VITEST === "true",
  appName: process.env.NEXT_PUBLIC_APP_NAME ?? "LeoPay",
  appUrl: resolveAppUrl(),
  databaseUrl: process.env.DATABASE_URL ?? "",
  /**
   * The application database is PostgreSQL. `pglite` (a WASM build of
   * PostgreSQL) exists only as an explicit opt-in for test runs on machines
   * without a server; it is refused in production.
   */
  dbDriver: ((): "postgres" | "pglite" => {
    const raw = (process.env.DB_DRIVER ?? "postgres").toLowerCase();
    if (raw !== "postgres" && raw !== "pglite") {
      throw new Error(`DB_DRIVER must be "postgres" or "pglite" (got "${raw}")`);
    }
    return raw;
  })(),
  /** Supabase/Neon/PgBouncer-friendly pool size cap. */
  databasePoolMax: Number(process.env.DATABASE_POOL_MAX ?? 10),
  /** PGlite data directory — used only when DB_DRIVER=pglite. */
  pgliteDir: process.env.PGLITE_DIR ?? ".data/pglite",
  authSecret: process.env.AUTH_SECRET ?? "",
  sessionTtlDays: Number(process.env.SESSION_TTL_DAYS ?? 30),
  paymentProvider: (process.env.PAYMENT_PROVIDER ?? "mock") as "mock" | "paystack",
  paystackSecretKey: process.env.PAYSTACK_SECRET_KEY ?? "",
  paystackPublicKey: process.env.PAYSTACK_PUBLIC_KEY ?? "",
  flutterwaveSecretKey: process.env.FLUTTERWAVE_SECRET_KEY ?? "",
  monnifyApiKey: process.env.MONNIFY_API_KEY ?? "",
  monnifySecretKey: process.env.MONNIFY_SECRET_KEY ?? "",
  emailProvider: (process.env.EMAIL_PROVIDER ?? "log") as "log" | "resend",
  emailFrom: process.env.EMAIL_FROM ?? "LeoPay <no-reply@leopay.local>",
  emailApiKey: process.env.EMAIL_API_KEY ?? "",
  emailApiBase: process.env.EMAIL_API_BASE ?? "https://api.resend.com",
  storageEndpoint: process.env.STORAGE_ENDPOINT ?? "",
  storageBucket: process.env.STORAGE_BUCKET ?? "",
  storageAccessKeyId: process.env.STORAGE_ACCESS_KEY_ID ?? "",
  storageSecretAccessKey: process.env.STORAGE_SECRET_ACCESS_KEY ?? "",
  /**
   * Where merchant images are written when no object-storage driver is
   * configured. Must be a persistent volume in production.
   */
  uploadDir: process.env.UPLOAD_DIR ?? ".data/uploads",
  /**
   * Platform-wide floor: force owners/admins to enrol in MFA before they can
   * perform sensitive actions. Organizations can opt in on their own too.
   */
  requireMfaForAdmins: bool(process.env.REQUIRE_MFA_FOR_ADMINS, false),
  webhookEncryptionKey: process.env.WEBHOOK_ENCRYPTION_KEY ?? "",
  logLevel: process.env.LOG_LEVEL ?? "info",
  /** Enables an in-process job ticker for webhooks/notifications (dev/single-node). */
  enableInlineJobs: bool(process.env.ENABLE_INLINE_JOBS, !isProduction),
  jobRunnerToken: process.env.JOB_RUNNER_TOKEN ?? "",
  trustProxy: bool(process.env.TRUST_PROXY, true),
};

/**
 * Detects obvious placeholder secrets without embedding credential-like
 * literals in the source (which secret scanners rightly flag).
 */
function looksLikePlaceholder(value: string): boolean {
  const lowered = value.toLowerCase();
  // Words that only ever appear in sample configuration values.
  const hints = ["placeholder", "replace", "example", "sample", "dummy", "insecure", "your-"];
  if (hints.some((hint) => lowered.includes(hint))) return true;

  // A real secret mixes character classes and has high variety.
  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((pattern) => pattern.test(value)).length;
  return classes < 3 || new Set(value).size < 12;
}

export type RuntimeConfigProblem = { variable: string; message: string; fatal: boolean };

/**
 * Validates configuration that would be unsafe in production.
 * Returns problems rather than throwing so callers can decide how to react.
 */
export function checkRuntimeConfig(): RuntimeConfigProblem[] {
  const problems: RuntimeConfigProblem[] = [];
  const secret = env.authSecret;

  if (!secret) {
    problems.push({
      variable: "AUTH_SECRET",
      message: "AUTH_SECRET is required. Generate one with: openssl rand -base64 48",
      fatal: isProduction,
    });
  } else if (secret.length < 32 && isProduction) {
    problems.push({ variable: "AUTH_SECRET", message: "AUTH_SECRET must be at least 32 characters", fatal: true });
  } else if (looksLikePlaceholder(secret) && isProduction) {
    problems.push({ variable: "AUTH_SECRET", message: "AUTH_SECRET looks like a placeholder value", fatal: true });
  }

  if (env.dbDriver === "pglite") {
    problems.push({
      variable: "DB_DRIVER",
      message:
        "DB_DRIVER=pglite uses the embedded PostgreSQL build. Use it only for tests; set DATABASE_URL for a real server.",
      fatal: isProduction,
    });
  }

  if (!env.databaseUrl && env.dbDriver === "postgres") {
    problems.push({
      variable: "DATABASE_URL",
      message: "DATABASE_URL is required: the application runs on PostgreSQL.",
      fatal: isProduction,
    });
  }

  if (isProduction && env.paymentProvider === "mock") {
    problems.push({
      variable: "PAYMENT_PROVIDER",
      message: "Mock payments are development-only. Configure paystack (or set ALLOW_MOCK_PAYMENTS=true for demos).",
      fatal: process.env.ALLOW_MOCK_PAYMENTS !== "true",
    });
  }

  if (env.paymentProvider === "paystack" && !env.paystackSecretKey) {
    problems.push({
      variable: "PAYSTACK_SECRET_KEY",
      message: "PAYSTACK_SECRET_KEY is required when PAYMENT_PROVIDER=paystack",
      fatal: true,
    });
  }

  if (isProduction && env.emailProvider === "log") {
    problems.push({
      variable: "EMAIL_PROVIDER",
      message: "Email provider is 'log': emails will not be delivered. Configure resend for production.",
      fatal: false,
    });
  }

  if (!env.webhookEncryptionKey) {
    problems.push({
      variable: "WEBHOOK_ENCRYPTION_KEY",
      message: "WEBHOOK_ENCRYPTION_KEY is not set; beneficiary account numbers fall back to a derived key.",
      fatal: false,
    });
  }

  if (isProduction && !pathIsAbsolute(env.uploadDir)) {
    problems.push({
      variable: "UPLOAD_DIR",
      message:
        "UPLOAD_DIR should be an absolute path on a persistent volume in production; a relative path may not survive deploys.",
      fatal: false,
    });
  }

  return problems;
}

function pathIsAbsolute(value: string): boolean {
  return value.startsWith("/") || /^[A-Za-z]:[\\/]/.test(value);
}

/** Throws when a fatal production misconfiguration is detected. */
export function validateRuntimeConfig(): void {
  const problems = checkRuntimeConfig().filter((p) => p.fatal);
  if (problems.length) {
    throw new Error(
      `Unsafe configuration detected:\n${problems.map((p) => `- ${p.variable}: ${p.message}`).join("\n")}`,
    );
  }
}

export const isMockPaymentProvider = env.paymentProvider === "mock";
