/**
 * Vytvoří produkty a ceny s lookup_key (pro_month_czk, …).
 * STRIPE_SECRET_KEY=sk_test_… npm run stripe:setup
 * Idempotentní: existující lookup_key přeskočí.
 */
const KEY = process.env.STRIPE_SECRET_KEY;
if (!KEY) {
  console.error("Chybí STRIPE_SECRET_KEY.");
  process.exit(1);
}

const PRICES = [
  { key: "pro_month_czk", product: "Football Terminal Pro", amount: 19900, currency: "czk", interval: "month" },
  { key: "pro_year_czk", product: "Football Terminal Pro", amount: 159000, currency: "czk", interval: "year" },
  { key: "unlimited_month_czk", product: "Football Terminal Unlimited", amount: 39900, currency: "czk", interval: "month" },
  { key: "unlimited_year_czk", product: "Football Terminal Unlimited", amount: 319000, currency: "czk", interval: "year" },
  { key: "pro_month_eur", product: "Football Terminal Pro", amount: 999, currency: "eur", interval: "month" },
  { key: "pro_year_eur", product: "Football Terminal Pro", amount: 7990, currency: "eur", interval: "year" },
  { key: "unlimited_month_eur", product: "Football Terminal Unlimited", amount: 1999, currency: "eur", interval: "month" },
  { key: "unlimited_year_eur", product: "Football Terminal Unlimited", amount: 15990, currency: "eur", interval: "year" },
];

async function stripe(method, path, body) {
  const res = await fetch(`https://api.stripe.com${path}`, {
    method,
    headers: { authorization: `Bearer ${KEY}`, "content-type": "application/x-www-form-urlencoded" },
    body: body ? new URLSearchParams(body).toString() : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || `${method} ${path} ${res.status}`);
  return data;
}

const products = new Map();

async function productId(name) {
  const hit = products.get(name);
  if (hit) return hit;
  const listed = await stripe("GET", `/v1/products?active=true&limit=100`);
  for (const p of listed.data || []) {
    if (p.name === name) {
      products.set(name, p.id);
      return p.id;
    }
  }
  const created = await stripe("POST", "/v1/products", {
    name,
    "metadata[app]": "football-terminal",
  });
  products.set(name, created.id);
  return created.id;
}

for (const row of PRICES) {
  const existing = await stripe("GET", `/v1/prices?lookup_keys[]=${encodeURIComponent(row.key)}&active=true&limit=1`);
  if (existing.data?.[0]) {
    console.log(`ok ${row.key} ${existing.data[0].id}`);
    continue;
  }
  const created = await stripe("POST", "/v1/prices", {
    product: await productId(row.product),
    unit_amount: String(row.amount),
    currency: row.currency,
    lookup_key: row.key,
    "recurring[interval]": row.interval,
    "metadata[lookup]": row.key,
  });
  console.log(`new ${row.key} ${created.id}`);
}
