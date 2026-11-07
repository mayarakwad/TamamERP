import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies, headers } from "next/headers";
import { connection } from "next/server";
import { db } from "../db";

// Sessions live in the database. The browser only holds a random token in an
// httpOnly cookie; the database stores its SHA-256, so a leaked database
// can't be used to hijack sessions.

export const SESSION_COOKIE = "tamam_session";
const TTL_MS = 30 * 24 * 60 * 60 * 1000;
const RENEW_WHEN_LEFT_MS = 15 * 24 * 60 * 60 * 1000;

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function requestMeta() {
  const h = await headers();
  return {
    ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null,
    userAgent: h.get("user-agent")?.slice(0, 300) ?? null,
  };
}

export async function createSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + TTL_MS);
  const meta = await requestMeta();
  await db.session.create({
    data: { id: hashToken(token), userId, expiresAt, ip: meta.ip, userAgent: meta.userAgent },
  });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production" && process.env.INSECURE_COOKIES !== "1",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function readSession() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const id = hashToken(token);
  const session = await db.session.findUnique({ where: { id }, include: { user: true } });
  if (!session) return null;
  // Session validity depends on the current time, so this is request-time work.
  await connection();
  const now = Date.now();
  if (session.expiresAt.getTime() < now) {
    await db.session.delete({ where: { id } }).catch(() => {});
    return null;
  }
  // Sliding expiry: active people stay signed in. (The proxy refreshes the cookie.)
  if (session.expiresAt.getTime() - now < RENEW_WHEN_LEFT_MS) {
    await db.session
      .update({ where: { id }, data: { expiresAt: new Date(now + TTL_MS) } })
      .catch(() => {});
  }
  return session;
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await db.session.delete({ where: { id: hashToken(token) } }).catch(() => {});
  jar.delete(SESSION_COOKIE);
}

/** Sign out every other device (after a password change). */
export async function destroyOtherSessions(userId: string) {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const keep = token ? hashToken(token) : "";
  await db.session.deleteMany({ where: { userId, NOT: { id: keep } } });
}
