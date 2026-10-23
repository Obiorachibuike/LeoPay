import "server-only";
import { cookies, headers } from "next/headers";
import { cache } from "react";
import { and, eq, gt, isNull, lt, ne } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { sessions, users, type User } from "@/lib/db/schema";
import { generateToken, hashToken } from "@/lib/crypto";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

export const SESSION_COOKIE = "leopay_session";
export const ORG_COOKIE = "leopay_org";
const SESSION_TTL_MS = env.sessionTtlDays * 24 * 60 * 60 * 1000;

export type AuthSession = {
  user: User;
  sessionId: string;
  csrfToken: string;
};

type RequestMeta = { ip?: string | null; userAgent?: string | null };

export async function requestMeta(): Promise<RequestMeta> {
  let h: Awaited<ReturnType<typeof headers>>;
  try {
    h = await headers();
  } catch {
    return { ip: null, userAgent: null };
  }
  const forwarded = h.get("x-forwarded-for");
  return {
    ip: env.trustProxy ? (forwarded?.split(",")[0]?.trim() ?? h.get("x-real-ip")) : h.get("x-real-ip"),
    userAgent: h.get("user-agent")?.slice(0, 400) ?? null,
  };
}

/** Creates a session row and sets the HTTP-only session cookie. */
export async function createSession(userId: string, meta?: RequestMeta): Promise<string> {
  const token = generateToken(32);
  const csrfToken = generateToken(24);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  const [session] = await db
    .insert(sessions)
    .values({
      userId,
      tokenHash: hashToken(token),
      csrfToken,
      expiresAt,
      ip: meta?.ip ?? null,
      userAgent: meta?.userAgent ?? null,
    })
    .returning();
  try {
    const store = await cookies();
    store.set(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: env.isProduction,
      sameSite: "lax",
      path: "/",
      expires: expiresAt,
    });
  } catch {
    // Called outside a request scope (tests or background jobs): the session
    // row still exists, only the cookie cannot be set here.
  }
  return session!.id;
}

/** Reads and validates the current session. Cached per request. */
export const getSession = cache(async (): Promise<AuthSession | null> => {
  let token: string | undefined;
  try {
    const store = await cookies();
    token = store.get(SESSION_COOKIE)?.value;
  } catch {
    return null;
  }
  if (!token) return null;

  const rows = await db
    .select({ session: sessions, user: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(
      and(
        eq(sessions.tokenHash, hashToken(token)),
        isNull(sessions.revokedAt),
        gt(sessions.expiresAt, new Date()),
      ),
    )
    .limit(1);

  const row = rows[0];
  if (!row) return null;
  if (row.user.status !== "active") return null;
  return { user: row.user, sessionId: row.session.id, csrfToken: row.session.csrfToken };
});

export async function requireSession(): Promise<AuthSession> {
  const session = await getSession();
  if (!session) throw new (await import("@/lib/errors")).AppError("UNAUTHENTICATED", "Sign in to continue");
  return session;
}

export async function destroySession(): Promise<void> {
  let store: Awaited<ReturnType<typeof cookies>> | undefined;
  try {
    store = await cookies();
  } catch {
    return;
  }
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    await db
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(eq(sessions.tokenHash, hashToken(token)));
  }
  store.delete(SESSION_COOKIE);
  store.delete(ORG_COOKIE);
}

/** Invalidates every session for a user except optionally the current one. */
export async function revokeAllSessions(userId: string, exceptSessionId?: string): Promise<void> {
  await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(
      exceptSessionId
        ? and(eq(sessions.userId, userId), isNull(sessions.revokedAt), ne(sessions.id, exceptSessionId))
        : and(eq(sessions.userId, userId), isNull(sessions.revokedAt)),
    );
}

export async function setActiveOrganization(orgId: string): Promise<void> {
  try {
    const store = await cookies();
    store.set(ORG_COOKIE, orgId, {
      httpOnly: true,
      secure: env.isProduction,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
  } catch {
    // Outside a request scope; the organization cookie is optional state.
  }
}

export async function getActiveOrganizationId(): Promise<string | null> {
  try {
    const store = await cookies();
    return store.get(ORG_COOKIE)?.value ?? null;
  } catch {
    return null;
  }
}

/** Housekeeping: removes expired sessions and verification tokens. */
export async function pruneExpiredSessions(): Promise<number> {
  const result = await db.delete(sessions).where(lt(sessions.expiresAt, new Date())).returning({ id: sessions.id });
  if (result.length) logger.info("Pruned expired sessions", { count: result.length });
  return result.length;
}
