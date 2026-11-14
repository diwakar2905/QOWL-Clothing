import { describe, it, expect } from "vitest";
import { safeHref, safeInternalPath, slugify } from "@/lib/utils";
import { indianMobileSchema, pincodeSchema, addressSchema, passwordSchema } from "@/lib/validation";
import { toCsv } from "@/server/services/newsletter";
import { renderEmail } from "@/server/notifications/templates";
import { RazorpayGateway } from "@/server/payments/razorpay";
import { hmacSha256Hex } from "@/lib/crypto";
import { SYSTEM_ROLES, ALL_PERMISSIONS } from "@/server/auth/permissions";
import { parseSectionData } from "@/server/cms/sections";
import { parseListingParams } from "@/components/store/listing-params";

describe("URL safety", () => {
  it("blocks open redirects", () => {
    expect(safeInternalPath("//evil.com")).toBe("/");
    expect(safeInternalPath("https://evil.com")).toBe("/");
    expect(safeInternalPath("/\\evil.com")).toBe("/");
    expect(safeInternalPath("/account")).toBe("/account");
  });
  it("blocks javascript: links", () => {
    expect(safeHref("javascript:alert(1)")).toBeNull();
    expect(safeHref("http://insecure.example")).toBeNull();
    expect(safeHref("https://instagram.com/qowl")).toBe("https://instagram.com/qowl");
    expect(safeHref("/collections")).toBe("/collections");
  });
  it("slugifies", () => expect(slugify("Drop 001 / The Unwritten!")).toBe("drop-001-the-unwritten"));
});

describe("Indian validation", () => {
  it("normalises mobile numbers", () => {
    expect(indianMobileSchema.parse("+91 98765 43210")).toBe("9876543210");
    expect(indianMobileSchema.parse("09876543210")).toBe("9876543210");
    expect(indianMobileSchema.safeParse("1234567890").success).toBe(false);
  });
  it("validates PIN codes and addresses", () => {
    expect(pincodeSchema.safeParse("400001").success).toBe(true);
    expect(pincodeSchema.safeParse("012345").success).toBe(false);
    expect(addressSchema.safeParse({ fullName: "A B", phone: "9876543210", line1: "Flat 1", city: "Pune", state: "Narnia", pincode: "411001" }).success).toBe(false);
  });
  it("enforces password strength", () => {
    expect(passwordSchema.safeParse("short1").success).toBe(false);
    expect(passwordSchema.safeParse("onlyletterslong").success).toBe(false);
    expect(passwordSchema.safeParse("letters-and-1-number").success).toBe(true);
  });
});

describe("output encoding", () => {
  it("neutralises CSV formula injection", () => {
    expect(toCsv([["=HYPERLINK(1)", 'a"b', "x,y"]])).toBe(`'=HYPERLINK(1),"a""b","x,y"\n`);
  });
  it("escapes HTML in emails and strips header injection", () => {
    const r = renderEmail("Hi {{name}}\nBcc: x", "Hello {{name}}", { name: "<script>x</script>" });
    expect(r.html).not.toContain("<script>");
    expect(r.html).toContain("&lt;script&gt;");
    expect(r.subject).not.toContain("\n");
  });
});

describe("Razorpay signatures", () => {
  const g = new RazorpayGateway("rzp_test_x", "key_secret", "wh_secret", (() => { throw new Error("no network"); }) as unknown as typeof fetch);
  it("verifies checkout signatures (order_id|payment_id)", () => {
    const sig = hmacSha256Hex("key_secret", "order_1|pay_1");
    expect(g.verifyCheckoutSignature({ orderId: "order_1", paymentId: "pay_1", signature: sig })).toBe(true);
    expect(g.verifyCheckoutSignature({ orderId: "order_1", paymentId: "pay_2", signature: sig })).toBe(false);
    expect(g.verifyCheckoutSignature({ orderId: "order_1", paymentId: "pay_1", signature: "x" })).toBe(false);
  });
  it("verifies webhook signatures over the raw body and parses events", () => {
    const body = JSON.stringify({ event: "payment.captured", payload: { payment: { entity: { id: "pay_1", order_id: "order_1", status: "captured", amount: 100, currency: "INR" } } } });
    expect(g.verifyWebhook(body, hmacSha256Hex("wh_secret", body))).toBe(true);
    expect(g.verifyWebhook(body + " ", hmacSha256Hex("wh_secret", body))).toBe(false);
    const ev = g.parseWebhook(body, new Headers({ "x-razorpay-event-id": "evt_1" }));
    expect(ev.kind).toBe("payment.captured");
    expect(ev.eventId).toBe("evt_1");
  });
});

describe("RBAC", () => {
  it("super admin has every permission; others are least-privilege", () => {
    expect(SYSTEM_ROLES.super_admin!.permissions).toEqual(ALL_PERMISSIONS);
    expect(SYSTEM_ROLES.fulfillment_staff!.permissions).not.toContain("orders.refund");
    expect(SYSTEM_ROLES.content_manager!.permissions).not.toContain("orders.read");
    expect(SYSTEM_ROLES.support_staff!.permissions).not.toContain("settings.manage");
    expect(SYSTEM_ROLES.store_manager!.permissions).not.toContain("staff.manage");
  });
});

describe("untrusted input parsing", () => {
  it("rejects unsafe CMS links and falls back to defaults", () => {
    expect(parseSectionData("CAMPAIGN", { ctaHref: "javascript:alert(1)" }).ctaHref).toBe("");
    expect(parseSectionData("PRODUCT_GRID", { limit: 999 }).limit).toBe(6);
  });
  it("sanitises listing params", () => {
    const f = parseListingParams({ size: "M,L", min: "abc", max: "2000", page: "-3", sort: "drop table" });
    expect(f.sizes).toEqual(["M", "L"]);
    expect(f.minPrice).toBeUndefined();
    expect(f.maxPrice).toBe(200000);
    expect(f.page).toBe(1);
    expect(f.sort).toBeUndefined();
  });
});
