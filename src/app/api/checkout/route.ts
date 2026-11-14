import { placeOrder, type CheckoutInput } from "@/server/services/checkout";
import { clientIp } from "@/server/request";
import { handle, json, readJson } from "@/server/api";

export const POST = handle(async (req: Request) => {
  const result = await placeOrder((await readJson(req)) as CheckoutInput, { ip: await clientIp() });
  return json(result, { status: 201 });
});
