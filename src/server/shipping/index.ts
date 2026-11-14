import "server-only";
import { env } from "@/lib/env";
import { getSettings } from "@/server/services/settings";
import type { ShippingProvider, Serviceability, CreatedShipment } from "./provider";
import { ruleServiceability } from "./rules";
import { ShiprocketProvider } from "./shiprocket";

class ManualProvider implements ShippingProvider {
  readonly name = "manual" as const;
  readonly supportsAutomation = false;
  async checkServiceability(pincode: string, opts: { cod: boolean }) {
    return ruleServiceability(pincode, opts.cod, await getSettings());
  }
}

/** Development-only: PIN codes starting with 9 are unserviceable to exercise that path. */
class MockProvider implements ShippingProvider {
  readonly name = "mock" as const;
  readonly supportsAutomation = true;
  async checkServiceability(pincode: string, opts: { cod: boolean }): Promise<Serviceability> {
    const rules = ruleServiceability(pincode, opts.cod, await getSettings());
    if (pincode.startsWith("9")) return { serviceable: false, codAvailable: false, estimate: null, message: "Sorry, we don't deliver to this PIN code yet. (mock)", source: "mock" };
    return { ...rules, serviceable: true, estimate: rules.estimate ?? { minDays: 3, maxDays: 6 }, message: `${rules.estimate ? rules.message : "Estimated 3–6 days after dispatch."} (development mock)`, source: "mock" };
  }
  async createShipment(req: { orderNumber: string }): Promise<CreatedShipment> {
    const awb = `MOCK${req.orderNumber.replace(/\D/g, "")}${Date.now().toString().slice(-5)}`;
    return { providerOrderId: req.orderNumber, providerShipmentId: awb, awb, courierName: "Mock Courier (dev)", trackingUrl: undefined };
  }
  async cancelShipment() {}
}

let instance: ShippingProvider | undefined;
export function getShippingProvider(): ShippingProvider {
  if (instance) return instance;
  if (env.SHIPPING_PROVIDER === "shiprocket") {
    instance = new ShiprocketProvider({
      email: env.SHIPROCKET_EMAIL!,
      password: env.SHIPROCKET_PASSWORD!,
      pickupLocation: env.SHIPROCKET_PICKUP_LOCATION ?? "Primary",
      pickupPincode: env.SHIPROCKET_PICKUP_PINCODE!,
      webhookToken: env.SHIPROCKET_WEBHOOK_TOKEN,
    });
  } else if (env.SHIPPING_PROVIDER === "mock") {
    if (env.NODE_ENV === "production") throw new Error("Mock shipping is disabled in production");
    instance = new MockProvider();
  } else instance = new ManualProvider();
  return instance;
}

/** Serviceability with store rules applied on top (blocked PIN codes, COD rules). */
export async function checkDelivery(pincode: string, opts: { cod?: boolean } = {}): Promise<Serviceability> {
  const settings = await getSettings();
  const provider = getShippingProvider();
  const rules = ruleServiceability(pincode, !!opts.cod, settings);
  if (provider.name === "manual") return rules;
  let res: Serviceability;
  try {
    res = await provider.checkServiceability(pincode, { cod: !!opts.cod, weightGrams: settings.shipping.defaultWeightGrams });
  } catch {
    // Provider outage: fall back to store rules rather than inventing an answer.
    return { ...rules, message: rules.serviceable ? rules.message : "We couldn't check this PIN code right now. Please try again shortly." };
  }
  const blocked = settings.shipping.blockedPincodes.includes(pincode);
  return { ...res, serviceable: res.serviceable && !blocked, codAvailable: res.codAvailable && rules.codAvailable };
}
