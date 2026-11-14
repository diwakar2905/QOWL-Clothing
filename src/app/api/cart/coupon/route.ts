import { applyCoupon, removeCoupon } from "@/server/services/cart";
import { enforce } from "@/server/services/rate-limit";
import { clientIp } from "@/server/request";
import { handle, json, readJson } from "@/server/api";

export const POST = handle(async (req: Request) => {
  // Throttle code guessing.
  await enforce(`coupon:ip:${await clientIp()}`, 20, 600, "Too many attempts. Please wait a few minutes.");
  const { code } = (await readJson(req)) as { code?: string };
  await applyCoupon(String(code ?? ""));
  return json({ applied: true });
});

export const DELETE = handle(async () => {
  await removeCoupon();
  return json({ removed: true });
});
