import { canOpenMatch, canSeeListProbs, canSeeSim, isFuture, matchShell, shouldAutoClaim, stripListProbs, type Access, type Tier } from "./gate";
import {
  createCheckout,
  createPortal,
  ensureCustomer,
  isPaidSub,
  lookupKey,
  pauseMonthlySub,
  paymentsOn,
  periodEndIso,
  periodOfSub,
  priceIdOf,
  resumeMonthlySub,
  retrieveSub,
  StripeError,
  strId,
  tierOfSub,
  verifyStripeSignature,
  type BillPeriod,
  type PaidPlan,
} from "./stripe";

type Env = {
  DB: D1Database;
  ENVIRONMENT?: string;
  SITE_URL?: string;
  DATA_ORIGIN?: string;
  DATA_SECRET?: string;
  MAIL_FROM?: string;
  RESEND_API_KEY?: string;
  COOKIE_DOMAIN?: string;
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
};

type UserRow = {
  id: string;
  email: string;
  password_hash: string;
  locale: string;
  marketing_opt_in: number;
  email_verified_at: string | null;
};

type EntRow = {
  tier: string;
  status: string | null;
  period_end: string | null;
  stripe_customer_id: string | null;
  stripe_sub_id: string | null;
  billing_period: string | null;
};

const COOKIE = "ft_session";
const SESSION_DAYS = 30;
const VERIFY_HOURS = 24;
const RESET_HOURS = 2;
const MAX_FAILS = 5;
const LOCK_MIN = 15;
const PBKDF2_ITERS = 100_000;

const json = (data: unknown, status = 200, extra: HeadersInit = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...extra },
  });

const nowIso = () => new Date().toISOString();
const plusHours = (h: number) => new Date(Date.now() + h * 3600_000).toISOString();
const plusDays = (d: number) => new Date(Date.now() + d * 86400_000).toISOString();

const b64 = (buf: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");

const token = (bytes = 32) => {
  const a = crypto.getRandomValues(new Uint8Array(bytes));
  return [...a].map((x) => x.toString(16).padStart(2, "0")).join("");
};

const uid = () => crypto.randomUUID();

function normEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const e = raw.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) || e.length > 254) return null;
  return e;
}

/** Přihlášení bere e-mail, nebo lokální testovací jméno (`test` → test@local.test). */
function normLogin(raw: unknown): string | null {
  const email = normEmail(raw);
  if (email) return email;
  if (typeof raw !== "string") return null;
  const u = raw.trim().toLowerCase();
  if (!/^[a-z0-9._-]{2,40}$/.test(u)) return null;
  return `${u}@local.test`;
}

function localeOf(raw: unknown): "cs" | "en" {
  return raw === "cs" ? "cs" : "en";
}

async function hashPassword(password: string, salt?: Uint8Array): Promise<string> {
  const s = salt ?? crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: s, iterations: PBKDF2_ITERS }, key, 256);
  return `pbkdf2$${PBKDF2_ITERS}$${b64(s)}$${b64(bits)}`;
}

async function checkPassword(password: string, stored: string): Promise<boolean> {
  const [algo, iter, saltB64, hashB64] = stored.split("$");
  if (algo !== "pbkdf2" || !iter || !saltB64 || !hashB64) return false;
  const pad = (s: string) => s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  const salt = Uint8Array.from(atob(pad(saltB64)), (c) => c.charCodeAt(0));
  const got = await hashPassword(password, salt);
  if (got.length !== stored.length) return false;
  let diff = 0;
  for (let i = 0; i < got.length; i++) diff |= got.charCodeAt(i) ^ stored.charCodeAt(i);
  return diff === 0;
}

function readCookie(req: Request, name: string): string | null {
  const raw = req.headers.get("Cookie") || "";
  for (const part of raw.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

function setCookie(env: Env, tokenValue: string, maxAgeSec: number): string {
  const parts = [
    `${COOKIE}=${tokenValue}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAgeSec}`,
  ];
  if (env.ENVIRONMENT !== "development") parts.push("Secure");
  if (env.COOKIE_DOMAIN) parts.push(`Domain=${env.COOKIE_DOMAIN}`);
  return parts.join("; ");
}

function clearCookie(env: Env): string {
  return setCookie(env, "", 0);
}

function clientIp(req: Request): string {
  return req.headers.get("CF-Connecting-IP") || req.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() || "0";
}

async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const data = await req.json();
    return data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

async function locked(db: D1Database, key: string): Promise<boolean> {
  const row = await db.prepare("SELECT locked_until FROM login_attempts WHERE key = ?").bind(key).first<{ locked_until: string | null }>();
  return Boolean(row?.locked_until && row.locked_until > nowIso());
}

async function failLogin(db: D1Database, key: string): Promise<void> {
  const row = await db.prepare("SELECT fails, locked_until FROM login_attempts WHERE key = ?").bind(key).first<{ fails: number; locked_until: string | null }>();
  const fails = (row?.fails || 0) + 1;
  const lock = fails >= MAX_FAILS ? plusHours(LOCK_MIN / 60) : null;
  await db
    .prepare("INSERT INTO login_attempts (key, fails, locked_until) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET fails = ?, locked_until = ?")
    .bind(key, fails, lock, fails, lock)
    .run();
}

async function clearFails(db: D1Database, key: string): Promise<void> {
  await db.prepare("DELETE FROM login_attempts WHERE key = ?").bind(key).run();
}

async function userBySession(env: Env, req: Request): Promise<UserRow | null> {
  const t = readCookie(req, COOKIE);
  if (!t) return null;
  const row = await env.DB.prepare(
    `SELECT u.id, u.email, u.password_hash, u.locale, u.marketing_opt_in, u.email_verified_at
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token = ? AND s.expires_at > ?`,
  )
    .bind(t, nowIso())
    .first<UserRow>();
  return row || null;
}

async function createSession(env: Env, userId: string): Promise<string> {
  const t = token();
  await env.DB.prepare("INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)")
    .bind(t, userId, nowIso(), plusDays(SESSION_DAYS))
    .run();
  return t;
}

async function mePayload(env: Env, user: UserRow) {
  const ent = await env.DB.prepare(
    "SELECT tier, status, period_end, stripe_customer_id, stripe_sub_id FROM entitlements WHERE user_id = ?",
  )
    .bind(user.id)
    .first<EntRow>();
  const pick = await env.DB.prepare("SELECT fixture_id FROM free_picks WHERE user_id = ?").bind(user.id).first<{ fixture_id: number }>();
  const tier = ent?.tier === "pro" || ent?.tier === "unlimited" || ent?.tier === "account" ? ent.tier : "account";
  return {
    email: user.email,
    tier,
    period_end: ent?.period_end ?? null,
    free_fixture: pick?.fixture_id ?? null,
    email_verified: Boolean(user.email_verified_at),
    marketing_opt_in: Boolean(user.marketing_opt_in),
    locale: user.locale,
    payments: paymentsOn(env),
    has_billing: Boolean(ent?.stripe_customer_id),
  };
}

async function entOf(env: Env, userId: string): Promise<EntRow | null> {
  return env.DB.prepare(
    "SELECT tier, status, period_end, stripe_customer_id, stripe_sub_id FROM entitlements WHERE user_id = ?",
  )
    .bind(userId)
    .first<EntRow>();
}

function asPlan(raw: unknown): PaidPlan | null {
  return raw === "pro" || raw === "unlimited" ? raw : null;
}

function asPeriod(raw: unknown): BillPeriod | null {
  return raw === "month" || raw === "year" ? raw : null;
}

function pricingPath(locale: "cs" | "en"): string {
  return locale === "cs" ? "/cs/tarify" : "/pricing";
}

function liveSub(ent: EntRow | null): boolean {
  if (!ent?.stripe_sub_id) return false;
  const st = ent.status || "active";
  return st === "active" || st === "trialing" || st === "past_due" || st === "paused";
}

async function applySub(env: Env, userId: string, sub: Record<string, unknown>, customerId?: string | null): Promise<void> {
  const paid = isPaidSub(sub);
  const plan = tierOfSub(sub);
  const period = periodOfSub(sub);
  const tier = paid && plan ? plan : "account";
  const status = paid ? String(sub.status || "active") : "canceled";
  const cust = customerId || strId(sub.customer);
  const subId = strId(sub.id);
  await env.DB.prepare(
    `UPDATE entitlements
     SET tier = ?, status = ?, period_end = ?, stripe_customer_id = COALESCE(?, stripe_customer_id), stripe_sub_id = ?
     WHERE user_id = ?`,
  )
    .bind(tier, status, paid ? periodEndIso(sub) : null, cust, paid ? subId : null, userId)
    .run();
  if (period) {
    try {
      await env.DB.prepare("UPDATE entitlements SET billing_period = ? WHERE user_id = ?").bind(period, userId).run();
    } catch {
      /* starší D1 bez sloupce billing_period */
    }
  }
}

async function userIdFromStripe(env: Env, sub: Record<string, unknown>, fallbackCustomer?: string | null): Promise<string | null> {
  const meta = sub.metadata && typeof sub.metadata === "object" ? (sub.metadata as Record<string, unknown>) : {};
  if (typeof meta.user_id === "string" && meta.user_id) return meta.user_id;
  const cust = fallbackCustomer || strId(sub.customer);
  if (!cust) return null;
  const row = await env.DB.prepare("SELECT user_id FROM entitlements WHERE stripe_customer_id = ?").bind(cust).first<{ user_id: string }>();
  return row?.user_id ?? null;
}

async function handleWebhook(env: Env, req: Request): Promise<Response> {
  const secret = env.STRIPE_WEBHOOK_SECRET;
  if (!env.STRIPE_SECRET_KEY || !secret) return json({ error: "payments_off" }, 503);
  const payload = await req.text();
  const sig = req.headers.get("Stripe-Signature") || "";
  if (!(await verifyStripeSignature(payload, sig, secret))) return json({ error: "bad_signature" }, 400);
  let event: { type?: string; data?: { object?: Record<string, unknown> } };
  try {
    event = JSON.parse(payload) as { type?: string; data?: { object?: Record<string, unknown> } };
  } catch {
    return json({ error: "invalid" }, 400);
  }
  const obj = event.data?.object || {};
  const type = event.type || "";

  if (type === "checkout.session.completed") {
    const userId = typeof obj.client_reference_id === "string" ? obj.client_reference_id : typeof (obj.metadata as Record<string, unknown> | undefined)?.user_id === "string" ? String((obj.metadata as Record<string, unknown>).user_id) : null;
    const subId = strId(obj.subscription);
    const cust = strId(obj.customer);
    if (userId && cust) {
      await env.DB.prepare("UPDATE entitlements SET stripe_customer_id = ? WHERE user_id = ?").bind(cust, userId).run();
    }
    if (userId && subId) {
      const sub = await retrieveSub(env, subId);
      await applySub(env, userId, sub, cust);
    }
    return json({ ok: true });
  }

  if (
    type === "customer.subscription.created" ||
    type === "customer.subscription.updated" ||
    type === "customer.subscription.deleted" ||
    type === "customer.subscription.paused" ||
    type === "customer.subscription.resumed"
  ) {
    const userId = await userIdFromStripe(env, obj);
    if (userId) await applySub(env, userId, obj);
    return json({ ok: true });
  }

  if (type === "invoice.paid" || type === "invoice.payment_failed") {
    const subId = strId(obj.subscription);
    if (subId) {
      const sub = await retrieveSub(env, subId);
      const userId = await userIdFromStripe(env, sub, strId(obj.customer));
      if (userId) await applySub(env, userId, sub);
    }
    return json({ ok: true });
  }

  return json({ ok: true });
}

async function runSummerJob(env: Env, when: Date): Promise<void> {
  if (!paymentsOn(env)) return;
  const month = when.getUTCMonth();
  const pause = month === 5;
  const resume = month === 7;
  if (!pause && !resume) return;
  const rows = await env.DB.prepare(
    `SELECT user_id, stripe_sub_id FROM entitlements
     WHERE stripe_sub_id IS NOT NULL AND billing_period = 'month' AND tier IN ('pro', 'unlimited')`,
  ).all<{ user_id: string; stripe_sub_id: string }>();
  for (const row of rows.results || []) {
    try {
      if (pause) await pauseMonthlySub(env, row.stripe_sub_id);
      else await resumeMonthlySub(env, row.stripe_sub_id);
    } catch (err) {
      console.log(`summer ${row.stripe_sub_id} ${String(err)}`);
    }
  }
}

function siteUrl(env: Env): string {
  return (env.SITE_URL || "http://127.0.0.1:5173").replace(/\/$/, "");
}

function loginPath(locale: "cs" | "en"): string {
  return locale === "cs" ? "/cs/prihlaseni" : "/login";
}

async function sendMail(env: Env, to: string, subject: string, text: string, html: string): Promise<void> {
  const key = env.RESEND_API_KEY;
  if (!key) {
    console.log(`[mail:${to}] ${subject}\n${text}`);
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({ from: env.MAIL_FROM || "Football Terminal <noreply@football-terminal.com>", to: [to], subject, text, html }),
  });
  if (!res.ok) console.log(`resend ${res.status} ${await res.text()}`);
}

async function issueEmailToken(env: Env, user: UserRow, purpose: "verify" | "reset"): Promise<string> {
  const t = token();
  const hours = purpose === "verify" ? VERIFY_HOURS : RESET_HOURS;
  await env.DB.prepare("DELETE FROM email_tokens WHERE user_id = ? AND purpose = ?").bind(user.id, purpose).run();
  await env.DB.prepare("INSERT INTO email_tokens (token, user_id, purpose, expires_at) VALUES (?, ?, ?, ?)")
    .bind(t, user.id, purpose, plusHours(hours))
    .run();
  return t;
}

async function sendVerify(env: Env, user: UserRow): Promise<string> {
  const t = await issueEmailToken(env, user, "verify");
  const loc = localeOf(user.locale);
  const url = `${siteUrl(env)}${loginPath(loc)}?verify=${t}`;
  const subject = loc === "cs" ? "Potvrďte e-mail na Football Terminal" : "Confirm your Football Terminal email";
  const text =
    loc === "cs"
      ? `Dobrý den,\n\npotvrďte e-mail kliknutím na odkaz (platí 24 hodin):\n${url}\n\nPokud jste se neregistrovali, tento e-mail ignorujte.`
      : `Hello,\n\nconfirm your email by opening this link (valid 24 hours):\n${url}\n\nIf you did not create an account, ignore this email.`;
  await sendMail(env, user.email, subject, text, `<p>${text.replace(/\n/g, "<br>")}</p>`);
  return url;
}

async function sendReset(env: Env, user: UserRow): Promise<string> {
  const t = await issueEmailToken(env, user, "reset");
  const loc = localeOf(user.locale);
  const url = `${siteUrl(env)}${loginPath(loc)}?reset=${t}`;
  const subject = loc === "cs" ? "Obnova hesla — Football Terminal" : "Reset your Football Terminal password";
  const text =
    loc === "cs"
      ? `Dobrý den,\n\nheslo obnovíte na tomto odkazu (platí 2 hodiny):\n${url}\n\nPokud jste o změnu nežádali, e-mail ignorujte.`
      : `Hello,\n\nreset your password using this link (valid 2 hours):\n${url}\n\nIf you did not ask for a reset, ignore this email.`;
  await sendMail(env, user.email, subject, text, `<p>${text.replace(/\n/g, "<br>")}</p>`);
  return url;
}

function devLinks(env: Env): boolean {
  return env.ENVIRONMENT === "development";
}

const PRIVATE = { "cache-control": "private, no-store", vary: "Cookie" };

function dataJson(data: unknown, status = 200): Response {
  return json(data, status, PRIVATE);
}

function asTier(raw: string | undefined): Tier {
  return raw === "pro" || raw === "unlimited" || raw === "account" ? raw : "anon";
}

async function accessOf(env: Env, req: Request): Promise<Access> {
  const user = await userBySession(env, req);
  let tier: Tier = "anon";
  let freeFixture: number | null = null;
  let userId: string | null = null;
  if (user) {
    const me = await mePayload(env, user);
    tier = asTier(me.tier);
    freeFixture = me.free_fixture;
    userId = user.id;
  }
  if (env.ENVIRONMENT === "development") {
    const v = req.headers.get("X-FT-ViewAs");
    if (v === "anon" || v === "account" || v === "pro" || v === "unlimited") {
      const keepUser = v === tier;
      let free = keepUser ? freeFixture : null;
      if (v === "account" && !keepUser) {
        const hdr = Number(req.headers.get("X-FT-Free-Fixture") || 0);
        free = hdr > 0 ? hdr : null;
      }
      return { tier: v, freeFixture: free, userId: keepUser ? userId : null };
    }
  }
  return { tier, freeFixture, userId };
}

/** DEV ViewAs účet bez session: první budoucí zápas v requestu se bere jako volný pick. */
function previewPick(access: Access, fixtureId: number, startingAt: string): Access {
  if (access.userId || access.tier !== "account" || access.freeFixture != null) return access;
  if (!isFuture(startingAt)) return access;
  return { ...access, freeFixture: fixtureId };
}

async function maybeClaim(env: Env, access: Access, fixtureId: number, startingAt: string): Promise<Access> {
  if (!access.userId || !shouldAutoClaim(access, startingAt)) return access;
  try {
    await env.DB.prepare("INSERT INTO free_picks (user_id, fixture_id, claimed_at) VALUES (?, ?, ?)")
      .bind(access.userId, fixtureId, nowIso())
      .run();
    return { ...access, freeFixture: fixtureId };
  } catch {
    const row = await env.DB.prepare("SELECT fixture_id FROM free_picks WHERE user_id = ?")
      .bind(access.userId)
      .first<{ fixture_id: number }>();
    return { ...access, freeFixture: row?.fixture_id ?? access.freeFixture };
  }
}

async function originData(env: Env, pathname: string): Promise<Response> {
  const base = (env.DATA_ORIGIN || env.SITE_URL || "http://127.0.0.1:5173").replace(/\/$/, "");
  const headers: Record<string, string> = {};
  if (env.DATA_SECRET) headers["X-FT-Raw"] = env.DATA_SECRET;
  return fetch(`${base}/__raw${pathname}`, { headers });
}

async function originJson(env: Env, pathname: string): Promise<Record<string, unknown> | null> {
  const res = await originData(env, pathname);
  if (!res.ok) return null;
  try {
    const data = await res.json();
    return data && typeof data === "object" ? (data as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

async function serveList(env: Env, req: Request, pathname: string): Promise<Response> {
  const data = await originJson(env, pathname);
  if (!data) return dataJson({ error: "not_found" }, 404);
  const access = await accessOf(env, req);
  return dataJson(canSeeListProbs(access.tier) ? data : stripListProbs(data));
}

async function serveMatch(env: Env, req: Request, fixtureId: number): Promise<Response> {
  const data = await originJson(env, `/data/matches/${fixtureId}.json`);
  if (!data) return dataJson({ error: "not_found" }, 404);
  const startingAt = typeof data.starting_at === "string" ? data.starting_at : "";
  const access = await maybeClaim(env, previewPick(await accessOf(env, req), fixtureId, startingAt), fixtureId, startingAt);
  if (canOpenMatch(access, fixtureId, startingAt)) return dataJson(data);
  return dataJson(matchShell(data));
}

async function serveSim(env: Env, req: Request, fixtureId: number): Promise<Response> {
  const match = await originJson(env, `/data/matches/${fixtureId}.json`);
  const startingAt = typeof match?.starting_at === "string" ? match.starting_at : "";
  const access = await maybeClaim(env, previewPick(await accessOf(env, req), fixtureId, startingAt), fixtureId, startingAt);
  if (!match || !canSeeSim(access)) return dataJson({ error: "unauthorized" }, 401);
  const res = await originData(env, `/data/sim/${fixtureId}.json`);
  if (!res.ok) return dataJson({ error: "not_found" }, 404);
  const body = await res.text();
  return new Response(body, {
    status: 200,
    headers: { "content-type": "application/json; charset=utf-8", ...PRIVATE },
  });
}

export default {
  async scheduled(event: { scheduledTime: number }, env: Env): Promise<void> {
    await runSummerJob(env, new Date(event.scheduledTime));
  },

  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname.replace(/\/$/, "") || "/";
    const method = req.method.toUpperCase();

    if (method === "OPTIONS") return new Response(null, { status: 204 });

    try {
      if (method === "GET" && path === "/api/me") {
        const user = await userBySession(env, req);
        if (!user) return json({ tier: "anon", payments: paymentsOn(env) });
        return json(await mePayload(env, user));
      }

      if (method === "POST" && path === "/api/me/free-fixture") {
        const user = await userBySession(env, req);
        if (!user) return json({ error: "unauthorized" }, 401);
        const body = await readJson(req);
        const fid = Number(body.fixture_id);
        if (!Number.isFinite(fid) || fid <= 0) return json({ error: "invalid" }, 400);
        const existing = await env.DB.prepare("SELECT fixture_id FROM free_picks WHERE user_id = ?").bind(user.id).first<{ fixture_id: number }>();
        if (existing) return json({ free_fixture: existing.fixture_id });
        await env.DB.prepare("INSERT INTO free_picks (user_id, fixture_id, claimed_at) VALUES (?, ?, ?)").bind(user.id, fid, nowIso()).run();
        return json({ free_fixture: fid });
      }

      if (method === "POST" && path === "/api/auth/register") {
        const body = await readJson(req);
        const email = normEmail(body.email);
        const password = typeof body.password === "string" ? body.password : "";
        const loc = localeOf(body.locale);
        if (!email) return json({ error: "invalid_email" }, 400);
        if (password.length < 8 || password.length > 200) return json({ error: "weak_password" }, 400);
        if (body.age18 !== true) return json({ error: "need_age" }, 400);
        const exists = await env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(email).first();
        if (exists) return json({ error: "email_taken" }, 409);
        const id = uid();
        const hash = await hashPassword(password);
        const ts = nowIso();
        const opt = body.marketing_opt_in === true;
        await env.DB.prepare(
          `INSERT INTO users (id, email, password_hash, locale, marketing_opt_in, marketing_opt_in_at, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
          .bind(id, email, hash, loc, opt ? 1 : 0, opt ? ts : null, ts, ts)
          .run();
        await env.DB.prepare("INSERT INTO entitlements (user_id, tier, status) VALUES (?, 'account', 'active')").bind(id).run();
        const user: UserRow = { id, email, password_hash: hash, locale: loc, marketing_opt_in: opt ? 1 : 0, email_verified_at: null };
        const verifyUrl = await sendVerify(env, user);
        const sess = await createSession(env, id);
        const out: Record<string, unknown> = { ok: true, needs_verify: true };
        if (devLinks(env)) out.dev_verify_url = verifyUrl;
        return json(out, 201, { "set-cookie": setCookie(env, sess, SESSION_DAYS * 86400) });
      }

      if (method === "POST" && path === "/api/auth/login") {
        const body = await readJson(req);
        const email = normLogin(body.email);
        const password = typeof body.password === "string" ? body.password : "";
        const ip = clientIp(req);
        if (!email || !password) return json({ error: "invalid_credentials" }, 401);
        if (await locked(env.DB, `email:${email}`) || await locked(env.DB, `ip:${ip}`)) {
          return json({ error: "locked" }, 429);
        }
        const user = await env.DB.prepare(
          "SELECT id, email, password_hash, locale, marketing_opt_in, email_verified_at FROM users WHERE email = ?",
        )
          .bind(email)
          .first<UserRow>();
        const ok = user ? await checkPassword(password, user.password_hash) : (await hashPassword(password), false);
        if (!user || !ok) {
          await failLogin(env.DB, `email:${email || "x"}`);
          await failLogin(env.DB, `ip:${ip}`);
          return json({ error: "invalid_credentials" }, 401);
        }
        await clearFails(env.DB, `email:${email}`);
        await clearFails(env.DB, `ip:${ip}`);
        const sess = await createSession(env, user.id);
        return json({ ok: true }, 200, { "set-cookie": setCookie(env, sess, SESSION_DAYS * 86400) });
      }

      if (method === "POST" && path === "/api/auth/logout") {
        const t = readCookie(req, COOKIE);
        if (t) await env.DB.prepare("DELETE FROM sessions WHERE token = ?").bind(t).run();
        return json({ ok: true }, 200, { "set-cookie": clearCookie(env) });
      }

      if (method === "POST" && path === "/api/auth/verify") {
        const body = await readJson(req);
        const tok = typeof body.token === "string" ? body.token : url.searchParams.get("token") || "";
        const row = await env.DB.prepare("SELECT user_id, purpose, expires_at FROM email_tokens WHERE token = ?")
          .bind(tok)
          .first<{ user_id: string; purpose: string; expires_at: string }>();
        if (!row || row.purpose !== "verify" || row.expires_at < nowIso()) return json({ error: "invalid_token" }, 400);
        await env.DB.prepare("UPDATE users SET email_verified_at = ?, updated_at = ? WHERE id = ? AND email_verified_at IS NULL")
          .bind(nowIso(), nowIso(), row.user_id)
          .run();
        await env.DB.prepare("DELETE FROM email_tokens WHERE token = ?").bind(tok).run();
        return json({ ok: true });
      }

      if (method === "POST" && path === "/api/auth/forgot") {
        const body = await readJson(req);
        const email = normEmail(body.email);
        let resetUrl: string | undefined;
        if (email) {
          const user = await env.DB.prepare(
            "SELECT id, email, password_hash, locale, marketing_opt_in, email_verified_at FROM users WHERE email = ?",
          )
            .bind(email)
            .first<UserRow>();
          if (user) resetUrl = await sendReset(env, user);
        }
        const out: Record<string, unknown> = { ok: true };
        if (devLinks(env) && resetUrl) out.dev_reset_url = resetUrl;
        return json(out);
      }

      if (method === "POST" && path === "/api/auth/reset") {
        const body = await readJson(req);
        const tok = typeof body.token === "string" ? body.token : "";
        const password = typeof body.password === "string" ? body.password : "";
        if (password.length < 8 || password.length > 200) return json({ error: "weak_password" }, 400);
        const row = await env.DB.prepare("SELECT user_id, purpose, expires_at FROM email_tokens WHERE token = ?")
          .bind(tok)
          .first<{ user_id: string; purpose: string; expires_at: string }>();
        if (!row || row.purpose !== "reset" || row.expires_at < nowIso()) return json({ error: "invalid_token" }, 400);
        const hash = await hashPassword(password);
        await env.DB.prepare("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?").bind(hash, nowIso(), row.user_id).run();
        await env.DB.prepare("DELETE FROM email_tokens WHERE token = ?").bind(tok).run();
        await env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(row.user_id).run();
        const sess = await createSession(env, row.user_id);
        return json({ ok: true }, 200, { "set-cookie": setCookie(env, sess, SESSION_DAYS * 86400) });
      }

      if (method === "POST" && path === "/api/billing/checkout") {
        const user = await userBySession(env, req);
        if (!user) return json({ error: "unauthorized" }, 401);
        if (!user.email_verified_at) return json({ error: "need_verify" }, 403);
        if (!paymentsOn(env)) return json({ error: "payments_off" }, 503);
        const body = await readJson(req);
        const plan = asPlan(body.plan);
        const period = asPeriod(body.period);
        const loc = localeOf(body.locale);
        if (!plan || !period) return json({ error: "invalid" }, 400);
        const ent = await entOf(env, user.id);
        if (liveSub(ent)) return json({ error: "has_subscription" }, 409);
        try {
          const currency = loc === "cs" ? "czk" : "eur";
          const customerId = await ensureCustomer(env, user.id, user.email, ent?.stripe_customer_id ?? null);
          if (customerId !== ent?.stripe_customer_id) {
            await env.DB.prepare("UPDATE entitlements SET stripe_customer_id = ? WHERE user_id = ?").bind(customerId, user.id).run();
          }
          const url = await createCheckout(env, {
            customerId,
            priceId: await priceIdOf(env, lookupKey(plan, period, currency)),
            userId: user.id,
            plan,
            period,
            locale: loc,
            successUrl: `${siteUrl(env)}${pricingPath(loc)}?paid=1`,
            cancelUrl: `${siteUrl(env)}${pricingPath(loc)}?canceled=1`,
          });
          return json({ url });
        } catch (err) {
          if (err instanceof StripeError) return json({ error: err.message }, err.status);
          throw err;
        }
      }

      if (method === "POST" && path === "/api/billing/portal") {
        const user = await userBySession(env, req);
        if (!user) return json({ error: "unauthorized" }, 401);
        if (!paymentsOn(env)) return json({ error: "payments_off" }, 503);
        const ent = await entOf(env, user.id);
        if (!ent?.stripe_customer_id) return json({ error: "no_billing" }, 404);
        try {
          const loc = localeOf(user.locale);
          const url = await createPortal(env, ent.stripe_customer_id, `${siteUrl(env)}${pricingPath(loc)}`);
          return json({ url });
        } catch (err) {
          if (err instanceof StripeError) return json({ error: err.message }, err.status);
          throw err;
        }
      }

      if (method === "POST" && path === "/api/billing/webhook") {
        return handleWebhook(env, req);
      }

      if (method === "POST" && path === "/api/auth/resend-verify") {
        const user = await userBySession(env, req);
        if (!user) return json({ error: "unauthorized" }, 401);
        if (user.email_verified_at) return json({ ok: true });
        const verifyUrl = await sendVerify(env, user);
        const out: Record<string, unknown> = { ok: true };
        if (devLinks(env)) out.dev_verify_url = verifyUrl;
        return json(out);
      }

      if (method === "GET") {
        if (path === "/data/upcoming.json") return serveList(env, req, path);
        const league = path.match(/^\/data\/leagues\/(\d+)\.json$/);
        if (league) return serveList(env, req, path);
        const match = path.match(/^\/data\/matches\/(\d+)\.json$/);
        if (match) return serveMatch(env, req, Number(match[1]));
        const sim = path.match(/^\/data\/sim\/(\d+)\.json$/);
        if (sim) return serveSim(env, req, Number(sim[1]));
      }

      return json({ error: "not_found" }, 404);
    } catch (err) {
      console.log(String(err));
      return json({ error: "server" }, 500);
    }
  },
};
