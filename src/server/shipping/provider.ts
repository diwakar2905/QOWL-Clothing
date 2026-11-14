import "server-only";

export type Serviceability = {
  serviceable: boolean;
  codAvailable: boolean;
  estimate: { minDays: number; maxDays: number } | null;
  message: string;
  source: "provider" | "store_rules" | "mock";
};

export type ShipmentRequest = {
  orderNumber: string;
  orderDate: Date;
  customerName: string;
  email: string;
  phone: string;
  address: { line1: string; line2?: string; landmark?: string; city: string; state: string; pincode: string };
  items: { name: string; sku: string; units: number; sellingPrice: number; hsn: string }[];
  paymentMethod: "ONLINE" | "COD";
  subtotal: number;
  weightGrams: number;
};

export type CreatedShipment = { providerOrderId?: string; providerShipmentId?: string; awb?: string; courierName?: string; trackingUrl?: string; labelUrl?: string };

export type TrackingEvent = { status: "SHIPPED" | "OUT_FOR_DELIVERY" | "DELIVERED" | "RTO_INITIATED" | "RTO_DELIVERED" | "IN_TRANSIT" | "OTHER"; description: string; location?: string; occurredAt: Date; dedupeKey: string };

export interface ShippingProvider {
  readonly name: "manual" | "mock" | "shiprocket";
  readonly supportsAutomation: boolean;
  checkServiceability(pincode: string, opts: { cod: boolean; weightGrams: number }): Promise<Serviceability>;
  createShipment?(req: ShipmentRequest): Promise<CreatedShipment>;
  cancelShipment?(awb: string, providerOrderId?: string): Promise<void>;
  track?(awb: string): Promise<TrackingEvent[]>;
  parseWebhook?(body: unknown, headers: Headers): { awb: string; events: TrackingEvent[] } | null;
}
