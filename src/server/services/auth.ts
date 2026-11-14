import "server-only";
import { z } from "zod";
import { db } from "@/lib/db";
import { randomToken, sha256 } from "@/lib/crypto";
import { AppError, badRequest } from "@/lib/errors";
import { emailSchema, indianMobileSchema, passwordSchema } from "@/lib/validation";
import { logger } from "@/lib/logger";
import { hashPassword, verifyPassword, dummyVerify } from "@/server/auth/password";
import { createSession, destroyAllSessions, destroyCurrentSession, getSession } from "@/server/auth/session";
import { enqueueEmail } from "@/server/notifications/outbox";
import { enforce, hit, peek, clear } from "./rate-limit";
import { mergeGuestCartOnLogin } from "./cart";
import { audit } from "./audit";

const appUrl = () => process.env.APP_URL ?? "http://localhost:3000";
// Failed sign-ins are counted per email address (whether or not an account
// exists), so lockout behaviour cannot be used to discover accounts.
const MAX_FAILURES = 10;
const FAILURE_WINDOW_SECONDS = 15 * 60;

export const registerSchema = z.object({
  name: z.string().trim().min(2, "Enter your name").max(80),
  email: emailSchema,
  password: passwordSchema,
  marketingOptIn: z.boolean().default(false),
});

export const loginSchema = z.object({ email: emailSchema, password: z.string().min(1, "Enter your password").max(128) });

async function issueToken(userId: string, type: "EMAIL_VERIFICATION" | "PASSWORD_RESET", ttlMs: number) {
  const token = randomToken(32);
  await db.authToken.updateMany({ where: { userId, type, usedAt: null }, data: { usedAt: new Date() } });
  await db.authToken.create({ data: { userId, type, tokenHash: sha256(token), expiresAt: new Date(Date.now() + ttlMs) } });
  return token;
}

export async function sendVerificationEmail(userId: string) {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  if (user.emailVerifiedAt) return;
  const token = await issueToken(userId, "EMAIL_VERIFICATION", 24 * 3600_000);
  await enqueueEmail({
    template: "account_verification",
    to: user.email,
    vars: { name: user.name ?? "there", link: `${appUrl()}/verify-email?token=${token}` },
    dedupeKey: `verify:${userId}:${sha256(token).slice(0, 16)}`,
  });
}

export async function register(input: z.input<typeof registerSchema>, ctx: { ip: string; userAgent?: string }) {
  await enforce(`register:ip:${ctx.ip}`, 10, 3600, "Too many sign-up attempts. Please try again later.");
  const data = registerSchema.parse(input);
  await enforce(`register:email:${sha256(data.email)}`, 3, 3600, "Too many sign-up attempts. Please try again later.");
  // Hash first in both branches so response timing doesn't reveal which path ran.
  const passwordHash = await hashPassword(data.password);
  const existing = await db.user.findUnique({ where: { email: data.email } });
  if (existing) {
    // Same response as a new sign-up; the owner is told by email instead.
    if (existing.status !== "DELETED") {
      await enqueueEmail({
        template: "account_exists",
        to: existing.email,
        vars: { name: existing.name ?? "there", loginLink: `${appUrl()}/login`, resetLink: `${appUrl()}/forgot-password` },
        dedupeKey: `account_exists:${existing.id}:${new Date().toISOString().slice(0, 10)}`,
      });
    }
    return;
  }
  const user = await db.user.create({
    data: {
      email: data.email,
      name: data.name,
      passwordHash,
      marketingOptIn: data.marketingOptIn,
      marketingConsentAt: data.marketingOptIn ? new Date() : null,
    },
  });
  // The account is activated (and signed in) from the verification email.
  await sendVerificationEmail(user.id);
  void ctx.userAgent;
}

export async function login(input: z.input<typeof loginSchema>, ctx: { ip: string; userAgent?: string; staffOnly?: boolean }) {
  const data = loginSchema.parse(input);
  await enforce(`login:ip:${ctx.ip}`, 30, 900, "Too many sign-in attempts. Please wait 15 minutes.");
  const failKey = `loginfail:${sha256(data.email)}`;
  if ((await peek(failKey)) >= MAX_FAILURES) throw tooManyFailures();
  const invalid = new AppError("INVALID_CREDENTIALS", "Incorrect email or password.", 401);
  const user = await db.user.findUnique({ where: { email: data.email }, include: { role: true } });
  if (!user || !user.passwordHash) {
    await dummyVerify(data.password);
    await hit(failKey, MAX_FAILURES, FAILURE_WINDOW_SECONDS);
    throw invalid;
  }
  const ok = await verifyPassword(user.passwordHash, data.password);
  if (!ok) {
    await hit(failKey, MAX_FAILURES, FAILURE_WINDOW_SECONDS);
    if (user.role) logger.warn("auth.staff_login_failed", { userId: user.id, ip: ctx.ip });
    throw invalid;
  }
  await clear(failKey);
  if (user.status === "SUSPENDED" || user.status === "DELETED") throw new AppError("ACCOUNT_DISABLED", "This account is not active. Please contact support.", 403);
  if (ctx.staffOnly && !user.role) throw invalid;
  await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await createSession(user.id, { isStaff: !!user.role, ip: ctx.ip, userAgent: ctx.userAgent });
  if (!user.role) await mergeGuestCartOnLogin(user.id);
  if (user.role) await audit({ actorId: user.id, action: "staff.login", entityType: "User", entityId: user.id, ipAddress: ctx.ip });
  return user;
}

function tooManyFailures() {
  return new AppError("RATE_LIMITED", "Too many failed sign-in attempts. Please wait 15 minutes or reset your password.", 429);
}

export async function logout() {
  await destroyCurrentSession();
}

/**
 * Confirms the email and signs the customer in (the token proves control of
 * the inbox). Called from a button press, not the GET of the link, so email
 * scanners that prefetch links can't consume the token.
 */
export async function verifyEmail(token: string, ctx: { ip?: string; userAgent?: string } = {}) {
  if (!token || token.length > 100) throw badRequest("Invalid verification link");
  const rec = await db.authToken.findUnique({ where: { tokenHash: sha256(token) }, include: { user: { include: { role: true } } } });
  if (!rec || rec.type !== "EMAIL_VERIFICATION" || rec.usedAt || rec.expiresAt < new Date() || rec.user.status === "DELETED" || rec.user.status === "SUSPENDED") {
    throw new AppError("TOKEN_INVALID", "This verification link is invalid or has expired.", 400);
  }
  await db.$transaction([
    db.authToken.update({ where: { id: rec.id }, data: { usedAt: new Date() } }),
    db.user.update({ where: { id: rec.userId }, data: { emailVerifiedAt: new Date() } }),
  ]);
  const current = await getSession();
  if (!current || current.user.id !== rec.userId) {
    await createSession(rec.userId, { isStaff: !!rec.user.role, ip: ctx.ip, userAgent: ctx.userAgent });
    if (!rec.user.role) await mergeGuestCartOnLogin(rec.userId);
  }
}

export async function requestPasswordReset(emailRaw: string, ctx: { ip: string }) {
  await enforce(`reset:ip:${ctx.ip}`, 10, 3600);
  const email = emailSchema.parse(emailRaw);
  await enforce(`reset:email:${sha256(email)}`, 3, 3600);
  const user = await db.user.findUnique({ where: { email } });
  // Always succeed silently to prevent account enumeration.
  if (!user || user.status === "DELETED") return;
  const token = await issueToken(user.id, "PASSWORD_RESET", 3600_000);
  await enqueueEmail({
    template: "password_reset",
    to: user.email,
    vars: { name: user.name ?? "there", link: `${appUrl()}/reset-password?token=${token}` },
    dedupeKey: `reset:${user.id}:${sha256(token).slice(0, 16)}`,
  });
}

export async function resetPassword(token: string, newPassword: string) {
  const password = passwordSchema.parse(newPassword);
  const rec = token && token.length <= 100 ? await db.authToken.findUnique({ where: { tokenHash: sha256(token) } }) : null;
  if (!rec || rec.type !== "PASSWORD_RESET" || rec.usedAt || rec.expiresAt < new Date()) {
    throw new AppError("TOKEN_INVALID", "This reset link is invalid or has expired. Request a new one.", 400);
  }
  await db.$transaction([
    db.authToken.update({ where: { id: rec.id }, data: { usedAt: new Date() } }),
    db.user.update({ where: { id: rec.userId }, data: { passwordHash: await hashPassword(password), emailVerifiedAt: new Date() } }),
  ]);
  // Invalidate every existing session after a reset.
  await destroyAllSessions(rec.userId);
  const u = await db.user.findUniqueOrThrow({ where: { id: rec.userId } });
  await clear(`loginfail:${sha256(u.email)}`);
}

export async function changePassword(userId: string, current: string, next: string) {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  if (!user.passwordHash || !(await verifyPassword(user.passwordHash, current))) throw new AppError("INVALID_CREDENTIALS", "Your current password is incorrect.", 400);
  await db.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword(passwordSchema.parse(next)) } });
  const s = await getSession();
  await destroyAllSessions(userId, s?.tokenHash);
}

export const profileSchema = z.object({
  name: z.string().trim().min(2).max(80),
  phone: indianMobileSchema.optional().or(z.literal("")).transform((v) => v || null),
  marketingOptIn: z.boolean(),
});

export async function updateProfile(userId: string, input: z.input<typeof profileSchema>) {
  const data = profileSchema.parse(input);
  const prev = await db.user.findUniqueOrThrow({ where: { id: userId } });
  await db.user.update({
    where: { id: userId },
    data: {
      name: data.name,
      phone: data.phone,
      marketingOptIn: data.marketingOptIn,
      marketingConsentAt: data.marketingOptIn !== prev.marketingOptIn ? new Date() : prev.marketingConsentAt,
    },
  });
}

export async function requestAccountDeletion(userId: string) {
  const user = await db.user.update({ where: { id: userId }, data: { status: "DELETION_REQUESTED", deletionRequestedAt: new Date(), marketingOptIn: false } });
  await enqueueEmail({ template: "account_deletion_requested", to: user.email, vars: { name: user.name ?? "there" }, dedupeKey: `deletion:${userId}` });
  await audit({ actorId: userId, action: "customer.deletion_requested", entityType: "User", entityId: userId });
}

/**
 * Admin-executed anonymisation. Order/invoice rows are retained (statutory
 * record keeping) but detached from the identity where possible.
 */
export async function anonymiseUser(userId: string, actorId: string) {
  await db.$transaction(async (tx) => {
    await tx.address.deleteMany({ where: { userId } });
    await tx.session.deleteMany({ where: { userId } });
    await tx.wishlist.deleteMany({ where: { userId } });
    await tx.cart.deleteMany({ where: { userId } });
    await tx.user.update({
      where: { id: userId },
      data: { email: `deleted+${userId}@deleted.invalid`, name: null, phone: null, passwordHash: null, status: "DELETED", marketingOptIn: false, supportNotes: null },
    });
    await audit({ actorId, action: "customer.anonymised", entityType: "User", entityId: userId }, tx);
  });
}
