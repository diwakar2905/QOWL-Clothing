import { reconcileCart } from "@/server/services/cart";
import { handle, json } from "@/server/api";

export const POST = handle(async () => {
  await reconcileCart();
  return json({ reconciled: true });
});
