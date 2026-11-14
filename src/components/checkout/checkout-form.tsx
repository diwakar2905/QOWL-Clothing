"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { addressSchema, emailSchema, indianMobileSchema, INDIAN_STATES } from "@/lib/validation";
import { api, ApiCallError, uuid } from "@/lib/client-api";
import { formatINR } from "@/lib/money";
import { cn } from "@/lib/utils";
import { useStore } from "@/components/providers/store";
import { Button } from "@/components/ui/button";
import { Checkbox, FormMessage, Input, Select, Textarea } from "@/components/ui/form";
import { Dialog } from "@/components/ui/dialog";
import { Loader2, Lock } from "lucide-react";
import { CouponForm } from "@/components/store/coupon-form";
import { CartTotals } from "@/components/store/cart-lines";
import { runPayment, type PaymentInit } from "./payment";

const formSchema = z.object({
  email: emailSchema,
  phone: indianMobileSchema,
  address: addressSchema,
  paymentMethod: z.enum(["ONLINE", "COD"]),
  acceptTerms: z.boolean().refine((v) => v, "Please accept the terms to place your order"),
  marketingOptIn: z.boolean(),
  saveAddress: z.boolean(),
  customerNote: z.string().max(300).optional(),
});
type FormIn = z.input<typeof formSchema>;
type FormOut = z.output<typeof formSchema>;

type SavedAddress = { id: string; fullName: string; phone: string; line1: string; line2: string; landmark: string; city: string; state: string; pincode: string; isDefault: boolean };
type CheckoutResult = { orderNumber: string; accessToken: string; paymentMethod: "ONLINE" | "COD"; amount: number; payment: PaymentInit | null };

const KEY = "qowl.checkout.v1";

export function CheckoutForm({
  user,
  addresses,
  cod,
  onlineEnabled,
  termsPublished,
  returnsSummary,
}: {
  user: { email: string; name: string | null; phone: string | null } | null;
  addresses: SavedAddress[];
  cod: { enabled: boolean; fee: number };
  onlineEnabled: boolean;
  termsPublished: boolean;
  returnsSummary: string;
}) {
  const router = useRouter();
  const { cart, refreshCart } = useStore();
  const [selectedAddress, setSelectedAddress] = useState<string | "new">(addresses[0]?.id ?? "new");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [pending, setPending] = useState<CheckoutResult | null>(null);
  const [codState, setCodState] = useState<{ pincode: string; ok: boolean; message?: string } | null>(null);
  const [mockOpen, setMockOpen] = useState<null | ((v: "success" | "failure" | "dismissed") => void)>(null);
  const errorRef = useRef<HTMLDivElement>(null);

  const first = addresses[0];
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors },
  } = useForm<FormIn, unknown, FormOut>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: user?.email ?? "",
      phone: user?.phone ?? first?.phone ?? "",
      address: first
        ? { fullName: first.fullName, phone: first.phone, line1: first.line1, line2: first.line2, landmark: first.landmark, city: first.city, state: first.state as (typeof INDIAN_STATES)[number], pincode: first.pincode, country: "IN" }
        : { fullName: user?.name ?? "", phone: "", line1: "", line2: "", landmark: "", city: "", state: undefined as unknown as (typeof INDIAN_STATES)[number], pincode: "", country: "IN" },
      paymentMethod: onlineEnabled ? "ONLINE" : "COD",
      acceptTerms: false,
      marketingOptIn: false,
      saveAddress: !!user && addresses.length === 0,
      customerNote: "",
    },
  });

  useEffect(() => {
    void refreshCart();
  }, [refreshCart]);

  const paymentMethod = watch("paymentMethod");
  const pincode = watch("address.pincode");
  const phone = watch("phone");
  useEffect(() => setValue("address.phone", phone ?? ""), [phone, setValue]);

  // COD availability depends on the delivery PIN code.
  useEffect(() => {
    if (!cod.enabled || !/^[1-9][0-9]{5}$/.test(pincode ?? "")) {
      setCodState(null);
      return;
    }
    const ctrl = new AbortController();
    api<{ serviceable: boolean; codAvailable: boolean; message: string }>(`/api/delivery?pincode=${pincode}`, { signal: ctrl.signal })
      .then((r) => setCodState({ pincode: pincode!, ok: r.serviceable && r.codAvailable, message: !r.serviceable ? r.message : r.codAvailable ? undefined : "Cash on Delivery isn't available for this PIN code." }))
      .catch(() => {});
    return () => ctrl.abort();
  }, [pincode, cod.enabled]);
  useEffect(() => {
    if (paymentMethod === "COD" && codState && !codState.ok && onlineEnabled) setValue("paymentMethod", "ONLINE");
  }, [codState, paymentMethod, onlineEnabled, setValue]);

  const cartSignature = useMemo(() => (cart ? `${cart.items.map((i) => `${i.variantId}:${i.quantity}`).join("|")}#${cart.pricing.grandTotal}#${cart.couponCode ?? ""}` : ""), [cart]);

  /** One idempotency key per cart state: a refresh/double-click reuses it; a changed cart gets a new one. */
  const idempotencyKey = () => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(KEY) ?? "null") as { sig: string; key: string } | null;
      if (saved?.sig === cartSignature) return saved.key;
      const key = uuid();
      sessionStorage.setItem(KEY, JSON.stringify({ sig: cartSignature, key }));
      return key;
    } catch {
      return uuid();
    }
  };

  const showError = (msg: string) => {
    setError(msg);
    setTimeout(() => errorRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
  };

  const pay = async (result: CheckoutResult) => {
    if (!result.payment) {
      finish(result);
      return;
    }
    const outcome = await runPayment(result.payment, (orderId) => new Promise((resolve) => setMockOpen(() => (v: "success" | "failure" | "dismissed") => { setMockOpen(null); resolve(v); void orderId; })));
    if (outcome.status === "failed" || outcome.status === "dismissed") {
      setPending(result);
      showError(outcome.message);
    } else finish(result);
  };

  const finish = (result: CheckoutResult) => {
    try {
      sessionStorage.removeItem(KEY);
    } catch {}
    const qs = new URLSearchParams({ order: result.orderNumber });
    if (result.accessToken) qs.set("t", result.accessToken);
    router.replace(`/checkout/confirmation?${qs}`);
  };

  const onSubmit = async (values: FormOut) => {
    if (!cart) return;
    setError(null);
    setSubmitting(true);
    try {
      if (pending) {
        const again = await api<CheckoutResult>("/api/checkout/retry", { body: { orderNumber: pending.orderNumber, token: pending.accessToken || undefined } });
        await pay({ ...again, accessToken: pending.accessToken });
        return;
      }
      const codFee = values.paymentMethod === "COD" ? cod.fee : 0;
      const result = await api<CheckoutResult>("/api/checkout", {
        body: { ...values, idempotencyKey: idempotencyKey(), expectedTotal: cart.pricing.grandTotal + codFee, customerNote: values.customerNote || undefined },
      });
      await pay(result);
    } catch (e) {
      const err = e as ApiCallError;
      if (err.error?.code === "TOTAL_CHANGED" || err.error?.code === "OUT_OF_STOCK" || err.error?.code === "CART_NOT_READY") await refreshCart();
      if (err.error?.code === "EXPIRED") setPending(null);
      showError(err.error?.fields ? "Please check the highlighted fields." : err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (!cart) return <div className="flex justify-center py-24"><Loader2 className="h-5 w-5 animate-spin text-forest" /><span className="sr-only">Loading checkout</span></div>;
  const codFee = paymentMethod === "COD" ? cod.fee : 0;
  const total = cart.pricing.grandTotal + codFee;
  const fe = errors.address ?? {};

  return (
    <div className="mt-10 grid gap-10 lg:grid-cols-[1fr_400px]">
      <form id="checkout-form" onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-10">
        {!user && (
          <p className="text-sm text-charcoal/80">
            Checking out as a guest. <Link href="/login?next=/checkout" className="text-forest underline underline-offset-4">Sign in</Link> to use saved addresses.
          </p>
        )}
        <section aria-labelledby="contact-h">
          <h2 id="contact-h" className="label-wide mb-4">1 · Contact</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Email" type="email" autoComplete="email" {...register("email")} error={errors.email?.message} readOnly={!!user} hint={user ? "Order updates go to your account email." : "We'll send your order confirmation here."} />
            <Input label="Mobile number" type="tel" inputMode="tel" autoComplete="tel-national" placeholder="10-digit mobile" {...register("phone")} error={errors.phone?.message} hint="For delivery updates from the courier." />
          </div>
        </section>

        <section aria-labelledby="ship-h">
          <h2 id="ship-h" className="label-wide mb-4">2 · Shipping address</h2>
          {addresses.length > 0 && (
            <fieldset className="mb-5 grid gap-3 sm:grid-cols-2">
              <legend className="sr-only">Saved addresses</legend>
              {addresses.map((a) => (
                <label key={a.id} className={cn("cursor-pointer border p-4 text-sm", selectedAddress === a.id ? "border-forest bg-forest/5" : "hairline")}>
                  <input
                    type="radio"
                    name="saved-address"
                    className="sr-only"
                    checked={selectedAddress === a.id}
                    onChange={() => {
                      setSelectedAddress(a.id);
                      reset({ ...watch(), phone: a.phone, address: { fullName: a.fullName, phone: a.phone, line1: a.line1, line2: a.line2, landmark: a.landmark, city: a.city, state: a.state as (typeof INDIAN_STATES)[number], pincode: a.pincode, country: "IN" }, saveAddress: false });
                    }}
                  />
                  <span className="font-medium">{a.fullName}</span>
                  <span className="mt-1 block text-charcoal/80">{a.line1}{a.line2 && `, ${a.line2}`}, {a.city}, {a.state} {a.pincode}</span>
                </label>
              ))}
              <label className={cn("flex cursor-pointer items-center border p-4 text-sm", selectedAddress === "new" ? "border-forest bg-forest/5" : "hairline")}>
                <input type="radio" name="saved-address" className="sr-only" checked={selectedAddress === "new"} onChange={() => { setSelectedAddress("new"); reset({ ...watch(), address: { fullName: "", phone: watch("phone"), line1: "", line2: "", landmark: "", city: "", state: undefined as unknown as (typeof INDIAN_STATES)[number], pincode: "", country: "IN" }, saveAddress: true }); }} />
                + Use a new address
              </label>
            </fieldset>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <Input className="sm:col-span-2" label="Full name" autoComplete="name" {...register("address.fullName")} error={fe.fullName?.message} />
            <Input className="sm:col-span-2" label="Address line 1" autoComplete="address-line1" placeholder="House / flat no., building, street" {...register("address.line1")} error={fe.line1?.message} />
            <Input className="sm:col-span-2" label="Address line 2" optional autoComplete="address-line2" placeholder="Area, locality" {...register("address.line2")} error={fe.line2?.message} />
            <Input label="Landmark" optional {...register("address.landmark")} error={fe.landmark?.message} />
            <Input label="PIN code" inputMode="numeric" maxLength={6} autoComplete="postal-code" {...register("address.pincode")} error={fe.pincode?.message ?? (codState && codState.message && !codState.message.includes("Cash") ? codState.message : undefined)} />
            <Input label="City" autoComplete="address-level2" {...register("address.city")} error={fe.city?.message} />
            <Select label="State" autoComplete="address-level1" defaultValue="" {...register("address.state")} error={fe.state?.message}>
              <option value="" disabled>Select state</option>
              {INDIAN_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
            </Select>
            <Input label="Country" value="India" readOnly disabled />
            {user && selectedAddress === "new" && <Checkbox className="sm:col-span-2" label="Save this address to my account" {...register("saveAddress")} />}
          </div>
        </section>

        <section aria-labelledby="pay-h">
          <h2 id="pay-h" className="label-wide mb-4">3 · Payment</h2>
          <fieldset className="space-y-3">
            <legend className="sr-only">Payment method</legend>
            {onlineEnabled && (
              <label className={cn("flex cursor-pointer items-start gap-3 border p-4", paymentMethod === "ONLINE" ? "border-forest bg-forest/5" : "hairline")}>
                <input type="radio" value="ONLINE" {...register("paymentMethod")} className="mt-1 accent-forest" />
                <span>
                  <span className="block text-sm font-medium">Pay online — UPI, cards, netbanking, wallets</span>
                  <span className="block text-xs text-charcoal/75">Secure payment via Razorpay. We never see or store your card details.</span>
                </span>
              </label>
            )}
            {cod.enabled && (
              <label className={cn("flex items-start gap-3 border p-4", paymentMethod === "COD" ? "border-forest bg-forest/5" : "hairline", codState && !codState.ok ? "cursor-not-allowed opacity-60" : "cursor-pointer")}>
                <input type="radio" value="COD" {...register("paymentMethod")} disabled={!!codState && !codState.ok} className="mt-1 accent-forest" />
                <span>
                  <span className="block text-sm font-medium">Cash on Delivery{cod.fee > 0 && ` (+${formatINR(cod.fee)} COD fee)`}</span>
                  <span className="block text-xs text-charcoal/75">{codState?.message ?? (codState?.ok ? "Available for this PIN code." : "Enter your PIN code to check availability.")}</span>
                </span>
              </label>
            )}
          </fieldset>
          <Textarea className="mt-5" label="Order note" optional rows={2} maxLength={300} {...register("customerNote")} />
        </section>
      </form>

      <aside className="h-fit border hairline bg-white/40 p-6 lg:sticky lg:top-28" aria-label="Order summary">
        <h2 className="label-wide mb-4">Order summary</h2>
        <ul className="mb-5 space-y-3">
          {cart.items.map((i) => (
            <li key={i.id} className="flex gap-3 text-sm">
              <span className="relative block h-16 w-14 shrink-0 overflow-hidden bg-cream">
                {i.imageUrl && <Image src={i.imageUrl} alt="" fill sizes="56px" className="object-cover" />}
                <span className="absolute -right-0 -top-0 flex h-5 min-w-5 items-center justify-center bg-forest px-1 text-[10px] text-ivory">{i.quantity}</span>
              </span>
              <span className="flex-1">
                <span className="block font-medium">{i.productName}</span>
                <span className="block text-xs text-charcoal/75">{i.colorName} / {i.size}</span>
                {i.issues.length > 0 && <span className="block text-xs text-danger">Needs attention in your bag</span>}
              </span>
              <span className="tabular-nums">{formatINR(i.lineSubtotal)}</span>
            </li>
          ))}
        </ul>
        <CouponForm />
        <div className="mt-4"><CartTotals cart={{ ...cart, pricing: { ...cart.pricing, codFee, grandTotal: total } }} /></div>
        {returnsSummary && <p className="mt-4 text-xs text-stone">{returnsSummary}</p>}
        <p className="mt-2 text-xs text-stone">
          Orders can be cancelled before they are packed from your order page. See our <Link href="/pages/returns-and-exchanges" className="underline">returns policy</Link>.
        </p>
        <Checkbox
          className="mt-5"
          form="checkout-form"
          {...register("acceptTerms")}
          error={errors.acceptTerms?.message}
          label={
            <>
              I agree to the {termsPublished ? <Link href="/pages/terms-of-service" target="_blank" className="underline">Terms of Service</Link> : "Terms of Service"} and{" "}
              <Link href="/pages/privacy-policy" target="_blank" className="underline">Privacy Policy</Link>.
            </>
          }
        />
        <Checkbox className="mt-3" form="checkout-form" {...register("marketingOptIn")} label="Email me about new drops and releases (optional)." />
        <div ref={errorRef} className="mt-4">{error && <FormMessage>{error}</FormMessage>}</div>
        {!cart.canCheckout && <FormMessage>{cart.blockers[0]} <Link href="/cart" className="underline">Review bag</Link></FormMessage>}
        <Button type="submit" form="checkout-form" size="lg" className="mt-5 w-full" loading={submitting} disabled={!cart.canCheckout}>
          <Lock className="h-4 w-4" />
          {pending ? `Retry payment — ${formatINR(pending.amount)}` : paymentMethod === "COD" ? `Place order — ${formatINR(total)}` : `Pay ${formatINR(total)}`}
        </Button>
      </aside>

      <Dialog open={!!mockOpen} onClose={() => mockOpen?.("dismissed")} title="Test payment (development only)">
        <div className="space-y-4 p-6 text-sm">
          <p>This is the development payment simulator. No real money moves. In production, Razorpay&apos;s secure checkout opens here.</p>
          <p className="font-medium">Amount: {formatINR(total)}</p>
          <div className="flex flex-wrap gap-3">
            <Button type="button" onClick={() => mockOpen?.("success")}>Simulate success</Button>
            <Button type="button" variant="danger" onClick={() => mockOpen?.("failure")}>Simulate failure</Button>
            <Button type="button" variant="outline" onClick={() => mockOpen?.("dismissed")}>Close window</Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
