/**
 * Loads `.env.local` and `.env` for CLI scripts (migrations, seed, dev helpers).
 *
 * Next.js loads these files itself at runtime; standalone `tsx` scripts do not,
 * so without this `npm run db:migrate` would not see DATABASE_URL. Real
 * environment variables always win, so a CI/system value is never overridden.
 *
 * Deliberately dependency-free and conservative: only simple KEY=value lines,
 * optional surrounding quotes, and `#` comments.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

function parse(contents: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;
    const key = match[1]!;
    let value = match[2]!.trim();
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length > 1) ||
      (value.startsWith("'") && value.endsWith("'") && value.length > 1)
    ) {
      value = value.slice(1, -1);
    } else {
      value = value.replace(/\s+#.*$/, "");
    }
    out[key] = value;
  }
  return out;
}

export function loadEnv(cwd = process.cwd()): void {
  for (const file of [".env.local", ".env"]) {
    const full = path.join(cwd, file);
    if (!existsSync(full)) continue;
    for (const [key, value] of Object.entries(parse(readFileSync(full, "utf8")))) {
      if (process.env[key] === undefined) process.env[key] = value;
    }
  }
}

loadEnv();
