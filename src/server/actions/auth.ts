"use server";

import { redirect } from "next/navigation";
import { runAction } from "@/server/api";
import { clientIp, userAgent } from "@/server/request";
import * as auth from "@/server/services/auth";
import { safeInternalPath } from "@/lib/utils";

const str = (f: FormData, k: string) => String(f.get(k) ?? "");

export async function loginAction(_prev: unknown, form: FormData) {
  const next = safeInternalPath(str(form, "next"), "/account");
  const r = await runAction(async () => {
    const user = await auth.login({ email: str(form, "email"), password: str(form, "password") }, { ip: await clientIp(), userAgent: await userAgent() });
    return { isStaff: !!user.roleId };
  });
  if (r.ok) redirect(r.data?.isStaff && next === "/account" ? "/admin" : next);
  return r;
}

export async function adminLoginAction(_prev: unknown, form: FormData) {
  const ctx = { ip: await clientIp(), userAgent: await userAgent(), staffOnly: true };
  // Never return the user record to the client.
  const r = await runAction(async () => {
    await auth.login({ email: str(form, "email"), password: str(form, "password") }, ctx);
  });
  const next = safeInternalPath(str(form, "next"), "/admin");
  if (r.ok) redirect(next.startsWith("/admin") ? next : "/admin");
  return r;
}

export async function registerAction(_prev: unknown, form: FormData) {
  // Identical response whether or not the email already has an account.
  return runAction(async () => {
    await auth.register({ name: str(form, "name"), email: str(form, "email"), password: str(form, "password"), marketingOptIn: form.get("marketingOptIn") === "on" }, { ip: await clientIp(), userAgent: await userAgent() });
  }, "Check your inbox — we've emailed you a link to confirm your address and finish signing up.");
}

export async function confirmEmailAction(_prev: unknown, form: FormData) {
  const r = await runAction(async () => {
    await auth.verifyEmail(str(form, "token"), { ip: await clientIp(), userAgent: await userAgent() });
  });
  if (r.ok) redirect("/account?welcome=1");
  return r;
}

export async function logoutAction() {
  await auth.logout();
  redirect("/");
}

export async function forgotPasswordAction(_prev: unknown, form: FormData) {
  return runAction(async () => {
    await auth.requestPasswordReset(str(form, "email"), { ip: await clientIp() });
  }, "If an account exists for that email, we've sent a reset link. It expires in 1 hour.");
}

export async function resetPasswordAction(_prev: unknown, form: FormData) {
  if (str(form, "password") !== str(form, "confirm")) return { ok: false as const, error: { code: "VALIDATION", message: "Passwords don't match.", fields: { confirm: "Passwords don't match." } } };
  const r = await runAction(() => auth.resetPassword(str(form, "token"), str(form, "password")));
  if (r.ok) redirect("/login?reset=1");
  return r;
}

export async function resendVerificationAction() {
  const { requireUser } = await import("@/server/auth/session");
  return runAction(async () => {
    const u = await requireUser();
    const { enforce } = await import("@/server/services/rate-limit");
    await enforce(`verify:user:${u.id}`, 3, 3600);
    await auth.sendVerificationEmail(u.id);
  }, "Verification email sent.");
}
