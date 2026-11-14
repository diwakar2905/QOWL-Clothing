import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { randomToken, sha256 } from "@/lib/crypto";
import { forbidden, unauthorized } from "@/lib/errors";
import { isPermission, type Permission } from "./permissions";

const PROD = process.env.NODE_ENV === "production";
// __Host- prefix forces Secure, Path=/ and no Domain in production.
export const SESSION_COOKIE = PROD ? "__Host-qowl_session" : "qowl_session";
const CUSTOMER_TTL_MS = 30 * 24 * 3600 * 1000;
const STAFF_TTL_MS = 12 * 3600 * 1000;

export type SessionUser = {
  id: string;
  email: string;
  name: string | null;
  phone: string | null;
  emailVerified: boolean;
  isStaff: boolean;
  roleKey: string | null;
  roleName: string | null;
  permissions: Permission[];
};

export async function createSession(userId: string, opts: { isStaff: boolean; ip?: string; userAgent?: string }) {
  const token = randomToken(32);
  const ttl = opts.isStaff ? STAFF_TTL_MS : CUSTOMER_TTL_MS;
  const expiresAt = new Date(Date.now() + ttl);
  await db.session.create({ data: { tokenHash: sha256(token), userId, expiresAt, ipAddress: opts.ip, userAgent: opts.userAgent } });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, { httpOnly: true, secure: PROD, sameSite: "lax", path: "/", expires: expiresAt });
  return { token, expiresAt };
}

export async function destroyCurrentSession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await db.session.deleteMany({ where: { tokenHash: sha256(token) } });
  jar.delete(SESSION_COOKIE);
}

export async function destroyAllSessions(userId: string, exceptTokenHash?: string) {
  await db.session.deleteMany({ where: { userId, ...(exceptTokenHash ? { NOT: { tokenHash: exceptTokenHash } } : {}) } });
}

async function loadSession(token: string) {
  const session = await db.session.findUnique({
    where: { tokenHash: sha256(token) },
    include: { user: { include: { role: true } } },
  });
  if (!session) return null;
  if (session.expiresAt < new Date() || session.user.status === "SUSPENDED" || session.user.status === "DELETED") {
    await db.session.delete({ where: { id: session.id } }).catch(() => {});
    return null;
  }
  // Touch at most once every 15 minutes to avoid a write per request.
  if (Date.now() - session.lastSeenAt.getTime() > 15 * 60 * 1000) {
    await db.session.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } }).catch(() => {});
  }
  const u = session.user;
  const user: SessionUser = {
    id: u.id,
    email: u.email,
    name: u.name,
    phone: u.phone,
    emailVerified: !!u.emailVerifiedAt,
    isStaff: !!u.role,
    roleKey: u.role?.key ?? null,
    roleName: u.role?.name ?? null,
    permissions: (u.role?.permissions ?? []).filter(isPermission),
  };
  return { sessionId: session.id, tokenHash: session.tokenHash, user };
}

/** Current session for this request (memoised per request). */
export const getSession = cache(async () => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token || token.length > 100) return null;
  return loadSession(token);
});

export async function getCurrentUser(): Promise<SessionUser | null> {
  return (await getSession())?.user ?? null;
}

export async function requireUser(): Promise<SessionUser> {
  const u = await getCurrentUser();
  if (!u) throw unauthorized();
  return u;
}

export function hasPermission(user: SessionUser | null, permission: Permission): boolean {
  return !!user && user.isStaff && user.permissions.includes(permission);
}

/** Server-side authorisation gate for every admin operation. */
export async function requirePermission(permission: Permission): Promise<SessionUser> {
  const u = await getCurrentUser();
  if (!u) throw unauthorized();
  if (!hasPermission(u, permission)) throw forbidden();
  return u;
}

export async function requireStaff(): Promise<SessionUser> {
  const u = await getCurrentUser();
  if (!u) throw unauthorized();
  if (!u.isStaff) throw forbidden();
  return u;
}
