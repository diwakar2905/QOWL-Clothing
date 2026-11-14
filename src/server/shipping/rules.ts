import "server-only";
import type { Settings } from "@/server/services/settings";
import type { Serviceability } from "./provider";

/** Store-configured serviceability (used by the manual provider and as a COD gate). */
export function ruleServiceability(pincode: string, cod: boolean, s: Settings): Serviceability {
  const ship = s.shipping;
  const pay = s.payments;
  const blocked = ship.blockedPincodes.includes(pincode);
  const prefixOk = ship.deliverAllIndia || ship.serviceablePincodePrefixes.some((p) => pincode.startsWith(p));
  const serviceable = !blocked && prefixOk;
  const codAvailable =
    serviceable && pay.codEnabled && !pay.codBlockedPincodes.includes(pincode) && (pay.codPincodePrefixes.length === 0 || pay.codPincodePrefixes.some((p) => pincode.startsWith(p)));
  const estimate = ship.estimateMinDays != null && ship.estimateMaxDays != null ? { minDays: ship.estimateMinDays, maxDays: ship.estimateMaxDays } : null;
  let message: string;
  if (!ship.deliverAllIndia && ship.serviceablePincodePrefixes.length === 0) message = "Delivery coverage hasn't been configured yet.";
  else if (!serviceable) message = "Sorry, we don't deliver to this PIN code yet.";
  else if (estimate) message = `Usually delivered in ${estimate.minDays}–${estimate.maxDays} days after dispatch.`;
  else message = "We deliver to this PIN code. Delivery timelines are shared once your order ships.";
  void cod;
  return { serviceable, codAvailable, estimate, message, source: "store_rules" };
}
