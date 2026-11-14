import { pincodeSchema } from "@/lib/validation";
import { checkDelivery } from "@/server/shipping";
import { enforce } from "@/server/services/rate-limit";
import { clientIp } from "@/server/request";
import { handle, json } from "@/server/api";

export const GET = handle(async (req: Request) => {
  await enforce(`pincode:ip:${await clientIp()}`, 40, 600);
  const pincode = pincodeSchema.parse(new URL(req.url).searchParams.get("pincode") ?? "");
  const r = await checkDelivery(pincode, { cod: true });
  return json({ pincode, serviceable: r.serviceable, codAvailable: r.codAvailable, estimate: r.estimate, message: r.message });
});
