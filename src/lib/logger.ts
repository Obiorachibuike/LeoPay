/**
 * Structured logger with redaction. Never log secrets, tokens or full account
 * numbers; the redactor also scrubs common credential field names.
 */
import { env } from "@/lib/env";

type Level = "debug" | "info" | "warn" | "error";
const LEVELS: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

const REDACT_KEYS = [
  "password",
  "passwordhash",
  "token",
  "tokenhash",
  "secret",
  "apikey",
  "api_key",
  "authorization",
  "cookie",
  "accountnumber",
  "account_number",
  "accountnumberencrypted",
  "cardnumber",
  "cvv",
  "privatekey",
];

function redact(value: unknown, depth = 0): unknown {
  if (depth > 4) return "[truncated]";
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => redact(v, depth + 1));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (REDACT_KEYS.includes(k.toLowerCase())) out[k] = "[redacted]";
      else out[k] = redact(v, depth + 1);
    }
    return out;
  }
  return value;
}

function log(level: Level, message: string, context?: Record<string, unknown>) {
  if (LEVELS[level] < LEVELS[(env.logLevel as Level) ?? "info"]) return;
  const entry = {
    level,
    time: new Date().toISOString(),
    msg: message,
    ...(context ? (redact(context) as Record<string, unknown>) : {}),
  };
  const line = env.isProduction ? JSON.stringify(entry) : `${level.toUpperCase()} ${message} ${context ? JSON.stringify(redact(context)) : ""}`;
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const logger = {
  debug: (message: string, context?: Record<string, unknown>) => log("debug", message, context),
  info: (message: string, context?: Record<string, unknown>) => log("info", message, context),
  warn: (message: string, context?: Record<string, unknown>) => log("warn", message, context),
  error: (message: string, context?: Record<string, unknown>) => log("error", message, context),
};
