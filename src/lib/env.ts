import "server-only";
import { z } from "zod";

/**
 * Centralised, validated server configuration. Import `env` instead of reading
 * process.env directly. Validation fails fast at boot with a readable error.
 */
const bool = z.enum(["true", "false"]).transform((v) => v === "true");

const schema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    APP_URL: z.url(),
    DATABASE_URL: z.string().min(1),
    SESSION_SECRET: z.string().min(32, "SESSION_SECRET must be at least 32 characters"),

    PAYMENT_PROVIDER: z.enum(["razorpay", "mock"]).default("razorpay"),
    RAZORPAY_KEY_ID: z.string().optional(),
    RAZORPAY_KEY_SECRET: z.string().optional(),
    RAZORPAY_WEBHOOK_SECRET: z.string().optional(),
    MOCK_PAYMENT_SECRET: z.string().optional(),

    SHIPPING_PROVIDER: z.enum(["manual", "shiprocket", "mock"]).default("manual"),
    SHIPROCKET_EMAIL: z.string().optional(),
    SHIPROCKET_PASSWORD: z.string().optional(),
    SHIPROCKET_PICKUP_LOCATION: z.string().optional(),
    SHIPROCKET_PICKUP_PINCODE: z.string().optional(),
    SHIPROCKET_WEBHOOK_TOKEN: z.string().optional(),

    EMAIL_PROVIDER: z.enum(["resend", "console"]).default("console"),
    RESEND_API_KEY: z.string().optional(),
    EMAIL_FROM: z.string().default("QOWL <no-reply@example.invalid>"),
    EMAIL_REPLY_TO: z.string().optional(),

    // SMS/WhatsApp require DLT-registered templates and explicit consent; the
    // adapter interface exists but no provider is wired up yet.
    SMS_PROVIDER: z.enum(["none"]).default("none"),

    STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
    LOCAL_STORAGE_DIR: z.string().default("./storage/uploads"),
    S3_BUCKET: z.string().optional(),
    S3_REGION: z.string().optional(),
    S3_ENDPOINT: z.string().optional(),
    S3_ACCESS_KEY_ID: z.string().optional(),
    S3_SECRET_ACCESS_KEY: z.string().optional(),
    MEDIA_PUBLIC_BASE_URL: z.string().optional(),

    // "Continue with Google" for customers. Leave both empty to hide the button.
    GOOGLE_CLIENT_ID: z.string().optional(),
    GOOGLE_CLIENT_SECRET: z.string().optional(),

    CRON_SECRET: z.string().min(16),
    TRUST_PROXY: bool.default(false),
    RESERVATION_TTL_MINUTES: z.coerce.number().int().min(5).max(120).default(30),
    LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  })
  .superRefine((e, ctx) => {
    const req = (key: keyof typeof e, cond: boolean, msg: string) => {
      if (cond && !e[key]) ctx.addIssue({ code: "custom", path: [key], message: msg });
    };
    const prod = e.NODE_ENV === "production";
    if (prod && e.PAYMENT_PROVIDER === "mock") {
      ctx.addIssue({ code: "custom", path: ["PAYMENT_PROVIDER"], message: "The mock payment provider is forbidden in production" });
    }
    if (prod && e.SHIPPING_PROVIDER === "mock") {
      ctx.addIssue({ code: "custom", path: ["SHIPPING_PROVIDER"], message: "The mock shipping provider is forbidden in production" });
    }
    if (prod && /dev-only|change-me/.test(e.SESSION_SECRET)) {
      ctx.addIssue({ code: "custom", path: ["SESSION_SECRET"], message: "Development SESSION_SECRET used in production" });
    }
    const rp = e.PAYMENT_PROVIDER === "razorpay";
    req("RAZORPAY_KEY_ID", rp, "Required when PAYMENT_PROVIDER=razorpay");
    req("RAZORPAY_KEY_SECRET", rp, "Required when PAYMENT_PROVIDER=razorpay");
    req("RAZORPAY_WEBHOOK_SECRET", rp, "Required when PAYMENT_PROVIDER=razorpay");
    req("MOCK_PAYMENT_SECRET", e.PAYMENT_PROVIDER === "mock", "Required when PAYMENT_PROVIDER=mock");
    if (prod && rp && e.RAZORPAY_KEY_ID?.startsWith("rzp_test_") && process.env.ALLOW_TEST_PAYMENTS_IN_PRODUCTION !== "true") {
      ctx.addIssue({ code: "custom", path: ["RAZORPAY_KEY_ID"], message: "Razorpay test key used in production" });
    }
    const sr = e.SHIPPING_PROVIDER === "shiprocket";
    req("SHIPROCKET_EMAIL", sr, "Required when SHIPPING_PROVIDER=shiprocket");
    req("SHIPROCKET_PASSWORD", sr, "Required when SHIPPING_PROVIDER=shiprocket");
    req("SHIPROCKET_PICKUP_PINCODE", sr, "Required when SHIPPING_PROVIDER=shiprocket");
    req("RESEND_API_KEY", e.EMAIL_PROVIDER === "resend", "Required when EMAIL_PROVIDER=resend");
    if (!!e.GOOGLE_CLIENT_ID !== !!e.GOOGLE_CLIENT_SECRET) {
      ctx.addIssue({ code: "custom", path: [e.GOOGLE_CLIENT_ID ? "GOOGLE_CLIENT_SECRET" : "GOOGLE_CLIENT_ID"], message: "Set both GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET, or neither" });
    }
    const s3 = e.STORAGE_DRIVER === "s3";
    for (const k of ["S3_BUCKET", "S3_REGION", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY", "MEDIA_PUBLIC_BASE_URL"] as const) {
      req(k, s3, "Required when STORAGE_DRIVER=s3");
    }
    if (prod && e.STORAGE_DRIVER === "local" && process.env.ALLOW_LOCAL_STORAGE_IN_PRODUCTION !== "true") {
      ctx.addIssue({ code: "custom", path: ["STORAGE_DRIVER"], message: "Use STORAGE_DRIVER=s3 in production (or set ALLOW_LOCAL_STORAGE_IN_PRODUCTION=true for a single persistent host)" });
    }
  });

export type Env = z.infer<typeof schema>;

function load(): Env {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid server environment configuration:\n${lines}`);
  }
  return parsed.data;
}

let cached: Env | undefined;
export const env: Env = new Proxy({} as Env, {
  get(_t, key: string) {
    cached ??= load();
    return cached[key as keyof Env];
  },
});

export const isProduction = () => env.NODE_ENV === "production";
