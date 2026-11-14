import "server-only";
import { logger } from "@/lib/logger";
import { safeEqual } from "@/lib/crypto";
import type { CreatedShipment, Serviceability, ShipmentRequest, ShippingProvider, TrackingEvent } from "./provider";

const API = "https://apiv2.shiprocket.in/v1/external";

/**
 * Shiprocket integration (auth, serviceability, adhoc order, AWB assignment,
 * label, cancellation, tracking, webhook parsing). Requires account
 * credentials and a configured pickup location; not exercised against the
 * live API in this repository's automated tests (HTTP is stubbed).
 */
export class ShiprocketProvider implements ShippingProvider {
  readonly name = "shiprocket" as const;
  readonly supportsAutomation = true;
  private token: { value: string; exp: number } | null = null;
  constructor(private cfg: { email: string; password: string; pickupLocation: string; pickupPincode: string; webhookToken?: string }, private fetchImpl: typeof fetch = fetch) {}

  private async auth(): Promise<string> {
    if (this.token && this.token.exp > Date.now()) return this.token.value;
    const res = await this.fetchImpl(`${API}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: this.cfg.email, password: this.cfg.password }), signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(`Shiprocket auth failed (${res.status})`);
    const body = (await res.json()) as { token: string };
    this.token = { value: body.token, exp: Date.now() + 9 * 86400_000 }; // tokens last 10 days
    return body.token;
  }

  private async call<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
    const res = await this.fetchImpl(`${API}${path}`, {
      method,
      headers: { Authorization: `Bearer ${await this.auth()}`, "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(20000),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`Shiprocket ${res.status}: ${text.slice(0, 300)}`);
    return JSON.parse(text) as T;
  }

  async checkServiceability(pincode: string, opts: { cod: boolean; weightGrams: number }): Promise<Serviceability> {
    const qs = new URLSearchParams({ pickup_postcode: this.cfg.pickupPincode, delivery_postcode: pincode, weight: String(opts.weightGrams / 1000), cod: opts.cod ? "1" : "0" });
    try {
      const r = await this.call<{ status: number; data?: { available_courier_companies?: { estimated_delivery_days?: string; cod?: number }[] } }>("GET", `/courier/serviceability/?${qs}`);
      const couriers = r.data?.available_courier_companies ?? [];
      if (!couriers.length) return { serviceable: false, codAvailable: false, estimate: null, message: "Sorry, we don't deliver to this PIN code yet.", source: "provider" };
      const days = couriers.map((c) => Number(c.estimated_delivery_days)).filter((n) => Number.isFinite(n) && n > 0);
      const estimate = days.length ? { minDays: Math.min(...days), maxDays: Math.max(...days) } : null;
      return {
        serviceable: true,
        codAvailable: couriers.some((c) => c.cod === 1),
        estimate,
        message: estimate ? `Estimated delivery in ${estimate.minDays}–${estimate.maxDays} days after dispatch.` : "We deliver to this PIN code.",
        source: "provider",
      };
    } catch (e) {
      logger.warn("shiprocket.serviceability_failed", { e });
      throw e;
    }
  }

  async createShipment(req: ShipmentRequest): Promise<CreatedShipment> {
    const order = await this.call<{ order_id: number; shipment_id: number }>("POST", "/orders/create/adhoc", {
      order_id: req.orderNumber,
      order_date: req.orderDate.toISOString().slice(0, 16).replace("T", " "),
      pickup_location: this.cfg.pickupLocation,
      billing_customer_name: req.customerName,
      billing_last_name: "",
      billing_address: req.address.line1,
      billing_address_2: [req.address.line2, req.address.landmark].filter(Boolean).join(", "),
      billing_city: req.address.city,
      billing_pincode: req.address.pincode,
      billing_state: req.address.state,
      billing_country: "India",
      billing_email: req.email,
      billing_phone: req.phone,
      shipping_is_billing: true,
      order_items: req.items.map((i) => ({ name: i.name, sku: i.sku, units: i.units, selling_price: (i.sellingPrice / 100).toFixed(2), hsn: i.hsn })),
      payment_method: req.paymentMethod === "COD" ? "COD" : "Prepaid",
      sub_total: (req.subtotal / 100).toFixed(2),
      length: 30, breadth: 25, height: 5,
      weight: req.weightGrams / 1000,
    });
    const awb = await this.call<{ response?: { data?: { awb_code?: string; courier_name?: string } } }>("POST", "/courier/assign/awb", { shipment_id: order.shipment_id });
    const awbCode = awb.response?.data?.awb_code;
    let labelUrl: string | undefined;
    try {
      const label = await this.call<{ label_url?: string }>("POST", "/courier/generate/label", { shipment_id: [order.shipment_id] });
      labelUrl = label.label_url;
    } catch (e) {
      logger.warn("shiprocket.label_failed", { e });
    }
    return {
      providerOrderId: String(order.order_id),
      providerShipmentId: String(order.shipment_id),
      awb: awbCode,
      courierName: awb.response?.data?.courier_name,
      trackingUrl: awbCode ? `https://shiprocket.co/tracking/${encodeURIComponent(awbCode)}` : undefined,
      labelUrl,
    };
  }

  async cancelShipment(_awb: string, providerOrderId?: string) {
    if (!providerOrderId) throw new Error("Shiprocket order id required to cancel");
    await this.call("POST", "/orders/cancel", { ids: [Number(providerOrderId)] });
  }

  async track(awb: string): Promise<TrackingEvent[]> {
    const r = await this.call<{ tracking_data?: { shipment_track_activities?: { date: string; activity: string; location: string; "sr-status-label"?: string }[] } }>("GET", `/courier/track/awb/${encodeURIComponent(awb)}`);
    return (r.tracking_data?.shipment_track_activities ?? []).map((a) => ({
      status: mapStatus(a["sr-status-label"] ?? a.activity),
      description: a.activity,
      location: a.location,
      occurredAt: new Date(a.date),
      dedupeKey: `shiprocket:${awb}:${a.date}:${a.activity}`.slice(0, 190),
    }));
  }

  parseWebhook(body: unknown, headers: Headers) {
    const token = headers.get("x-api-key");
    if (!this.cfg.webhookToken || !token || !safeEqual(token, this.cfg.webhookToken)) return null;
    const b = body as { awb?: string; current_status?: string; current_timestamp?: string; scans?: { date: string; activity: string; location: string; "sr-status-label"?: string }[] };
    if (!b?.awb) return null;
    const events: TrackingEvent[] = (b.scans?.length ? b.scans : [{ date: b.current_timestamp ?? new Date().toISOString(), activity: b.current_status ?? "Update", location: "" }]).map((s) => ({
      status: mapStatus(s["sr-status-label"] ?? s.activity),
      description: s.activity,
      location: s.location,
      occurredAt: new Date(s.date),
      dedupeKey: `shiprocket:${b.awb}:${s.date}:${s.activity}`.slice(0, 190),
    }));
    return { awb: b.awb, events };
  }
}

export function mapStatus(label: string): TrackingEvent["status"] {
  const s = label.toUpperCase();
  if (s.includes("RTO") && s.includes("DELIVERED")) return "RTO_DELIVERED";
  if (s.includes("RTO")) return "RTO_INITIATED";
  if (s.includes("OUT FOR DELIVERY")) return "OUT_FOR_DELIVERY";
  if (s.includes("DELIVERED")) return "DELIVERED";
  if (s.includes("PICKED UP") || s.includes("SHIPPED")) return "SHIPPED";
  if (s.includes("TRANSIT")) return "IN_TRANSIT";
  return "OTHER";
}
