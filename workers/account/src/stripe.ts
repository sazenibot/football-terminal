export type StripeEnv = {
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
};

export type PaidPlan = "pro" | "unlimited";
export type BillPeriod = "month" | "year";
export type BillCurrency = "czk" | "eur";

export class StripeError extends Error {
  status: number;
  constructor(message: string, status = 502) {
    super(message);
    this.status = status;
  }
}

type StripeObj = Record<string, unknown>;

const priceCache = new Map<string, string>();

export function paymentsOn(env: StripeEnv): boolean {
  return Boolean(env.STRIPE_SECRET_KEY);
}

export function lookupKey(plan: PaidPlan, period: BillPeriod, currency: BillCurrency): string {
  return `${plan}_${period}_${currency}`;
}

export function monthlyTrialEndUnix(now = Date.now()): number | null {
  const d = new Date(now);
  const m = d.getUTCMonth();
  if (m !== 5 && m !== 6) return null;
  return Math.floor(Date.UTC(d.getUTCFullYear(), 7, 1) / 1000);
}

function form(data: Record<string, string | number | undefined | null>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(data)) {
    if (v != null && v !== "") p.set(k, String(v));
  }
  return p.toString();
}

export async function stripeFetch(env: StripeEnv, method: string, path: string, body?: Record<string, string | number | undefined | null>): Promise<StripeObj> {
  const key = env.STRIPE_SECRET_KEY;
  if (!key) throw new StripeError("payments_off", 503);
  const res = await fetch(`https://api.stripe.com${path}`, {
    method,
    headers: {
      authorization: `Bearer ${key}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: body ? form(body) : undefined,
  });
  const data = (await res.json()) as StripeObj & { error?: { message?: string } };
  if (!res.ok) throw new StripeError(data.error?.message || `stripe_${res.status}`, res.status >= 500 ? 502 : 400);
  return data;
}

export async function priceIdOf(env: StripeEnv, key: string): Promise<string> {
  const hit = priceCache.get(key);
  if (hit) return hit;
  const data = await stripeFetch(env, "GET", `/v1/prices?lookup_keys[]=${encodeURIComponent(key)}&active=true&limit=1`);
  const row = Array.isArray(data.data) ? (data.data[0] as StripeObj | undefined) : undefined;
  const id = typeof row?.id === "string" ? row.id : "";
  if (!id) throw new StripeError("missing_price", 503);
  priceCache.set(key, id);
  return id;
}

export async function ensureCustomer(env: StripeEnv, userId: string, email: string, existing: string | null): Promise<string> {
  if (existing) return existing;
  const row = await stripeFetch(env, "POST", "/v1/customers", {
    email,
    "metadata[user_id]": userId,
  });
  const id = typeof row.id === "string" ? row.id : "";
  if (!id) throw new StripeError("customer", 502);
  return id;
}

export async function createCheckout(env: StripeEnv, args: {
  customerId: string;
  priceId: string;
  userId: string;
  plan: PaidPlan;
  period: BillPeriod;
  locale: "cs" | "en";
  successUrl: string;
  cancelUrl: string;
}): Promise<string> {
  const trial = args.period === "month" ? monthlyTrialEndUnix() : null;
  const waiver =
    args.locale === "cs"
      ? "Jde o digitální obsah. Potvrzuji zahájení ihned a ztrátu práva odstoupit v rozsahu již poskytnutého plnění."
      : "This is digital content. I agree it starts immediately and I lose the withdrawal right for what has already been provided.";
  const row = await stripeFetch(env, "POST", "/v1/checkout/sessions", {
    mode: "subscription",
    customer: args.customerId,
    "line_items[0][price]": args.priceId,
    "line_items[0][quantity]": 1,
    success_url: args.successUrl,
    cancel_url: args.cancelUrl,
    locale: args.locale,
    client_reference_id: args.userId,
    allow_promotion_codes: "true",
    billing_address_collection: "auto",
    "custom_text[submit][message]": waiver,
    "metadata[user_id]": args.userId,
    "metadata[tier]": args.plan,
    "metadata[period]": args.period,
    "subscription_data[billing_mode][type]": "flexible",
    "subscription_data[metadata][user_id]": args.userId,
    "subscription_data[metadata][tier]": args.plan,
    "subscription_data[metadata][period]": args.period,
    ...(trial ? { "subscription_data[trial_end]": trial } : {}),
  });
  const url = typeof row.url === "string" ? row.url : "";
  if (!url) throw new StripeError("checkout", 502);
  return url;
}

export async function createPortal(env: StripeEnv, customerId: string, returnUrl: string): Promise<string> {
  const row = await stripeFetch(env, "POST", "/v1/billing/portal/sessions", {
    customer: customerId,
    return_url: returnUrl,
  });
  const url = typeof row.url === "string" ? row.url : "";
  if (!url) throw new StripeError("portal", 502);
  return url;
}

export async function retrieveSub(env: StripeEnv, id: string): Promise<StripeObj> {
  return stripeFetch(env, "GET", `/v1/subscriptions/${id}`);
}

export async function pauseMonthlySub(env: StripeEnv, id: string): Promise<void> {
  await stripeFetch(env, "POST", `/v1/subscriptions/${id}`, {
    "pause_collection[behavior]": "void",
  });
}

export async function resumeMonthlySub(env: StripeEnv, id: string): Promise<void> {
  await stripeFetch(env, "POST", `/v1/subscriptions/${id}`, { pause_collection: "" });
}

function hex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function same(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export async function verifyStripeSignature(payload: string, header: string, secret: string, now = Date.now()): Promise<boolean> {
  const parts: Record<string, string[]> = {};
  for (const item of header.split(",")) {
    const i = item.indexOf("=");
    if (i < 0) continue;
    const k = item.slice(0, i).trim();
    const v = item.slice(i + 1).trim();
    (parts[k] ??= []).push(v);
  }
  const t = parts.t?.[0];
  const sigs = parts.v1 ?? [];
  if (!t || !sigs.length) return false;
  const ts = Number(t) * 1000;
  if (!Number.isFinite(ts) || Math.abs(now - ts) > 5 * 60_000) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${t}.${payload}`)));
  return sigs.some((s) => same(mac, s));
}

export function isPaidSub(sub: StripeObj): boolean {
  const status = String(sub.status || "");
  return status === "active" || status === "trialing" || status === "past_due" || status === "paused";
}

export function tierOfSub(sub: StripeObj): PaidPlan | null {
  const meta = sub.metadata && typeof sub.metadata === "object" ? (sub.metadata as Record<string, unknown>) : {};
  return meta.tier === "pro" || meta.tier === "unlimited" ? meta.tier : null;
}

export function periodOfSub(sub: StripeObj): BillPeriod | null {
  const meta = sub.metadata && typeof sub.metadata === "object" ? (sub.metadata as Record<string, unknown>) : {};
  if (meta.period === "month" || meta.period === "year") return meta.period;
  const items = sub.items && typeof sub.items === "object" ? (sub.items as { data?: StripeObj[] }).data : undefined;
  const price = items?.[0]?.price && typeof items[0].price === "object" ? (items[0].price as StripeObj) : null;
  const rec = price?.recurring && typeof price.recurring === "object" ? (price.recurring as StripeObj) : null;
  return rec?.interval === "year" ? "year" : rec?.interval === "month" ? "month" : null;
}

export function periodEndIso(sub: StripeObj): string | null {
  const end = Number(sub.current_period_end);
  return Number.isFinite(end) && end > 0 ? new Date(end * 1000).toISOString() : null;
}

export function strId(value: unknown): string | null {
  if (typeof value === "string" && value) return value;
  if (value && typeof value === "object" && typeof (value as StripeObj).id === "string") return (value as StripeObj).id as string;
  return null;
}
