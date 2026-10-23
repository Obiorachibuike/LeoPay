import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { createSession, requestMeta } from "@/lib/auth/session";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Local demo sign-in. Disabled unless ENABLE_DEV_LOGIN=true and the app is not
 * running in production. It exists so demo environments (and smoke tests) can
 * sign in without an email inbox; it is not an authentication bypass in
 * production because it refuses to run there at all.
 */
export async function POST(request: Request) {
  if (env.isProduction || process.env.ENABLE_DEV_LOGIN !== "true") {
    return Response.json({ error: "Not available" }, { status: 404 });
  }
  const body = (await request.json().catch(() => ({}))) as { email?: string };
  const email = (body.email ?? "").toLowerCase().trim();
  if (!email) return Response.json({ error: "email is required" }, { status: 422 });

  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!user) return Response.json({ error: "No such user" }, { status: 404 });
  if (user.status !== "active") return Response.json({ error: "User is suspended" }, { status: 403 });

  await createSession(user.id, await requestMeta());
  logger.warn("Development login used", { email });
  return Response.json({ ok: true, email: user.email });
}
