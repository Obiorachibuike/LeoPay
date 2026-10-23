/**
 * Development utility: mints a session for an existing user and prints the
 * cookie header so you can smoke-test authenticated pages with curl.
 *
 *   npm run dev:session -- demo@leopay.test
 *
 * It writes a real, revocable session row — never use this against production.
 */
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { generateToken, hashToken } from "@/lib/crypto";
import { sessions } from "@/lib/db/schema";

async function main() {
  if (env.isProduction) {
    console.error("Refusing to mint sessions in production.");
    process.exit(1);
  }
  const email = (process.argv[2] ?? "demo@leopay.test").toLowerCase();
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!user) {
    console.error(`No user with email ${email}. Run npm run db:seed first.`);
    process.exit(1);
  }
  const token = generateToken(32);
  await db.insert(sessions).values({
    userId: user.id,
    tokenHash: hashToken(token),
    csrfToken: generateToken(24),
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    userAgent: "leopay-dev-session script",
  });
  console.log(`leopay_session=${token}`);
  process.exit(0);
}

main();
