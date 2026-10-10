import { getLocale } from "../i18n/locale";

export type BillPeriod = "month" | "year";
export type PaidTier = "pro" | "unlimited";

const AMOUNTS = {
  pro: { month: { czk: 199, eur: 9.99 }, year: { czk: 1590, eur: 79.9 } },
  unlimited: { month: { czk: 399, eur: 19.99 }, year: { czk: 3190, eur: 159.9 } },
} as const;

function money(n: number): string {
  if (getLocale() === "cs") return `${Math.round(n).toLocaleString("cs-CZ")} Kč`;
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "EUR" }).format(n);
}

export function planPrice(id: PaidTier, period: BillPeriod): string {
  const loc = getLocale() === "cs" ? "czk" : "eur";
  return money(AMOUNTS[id][period][loc]);
}

/** Roční vs. 12× měsíc — částka i zaokrouhlená procenta. */
export function yearSave(id: PaidTier): { amount: string; pct: number } {
  const loc = getLocale() === "cs" ? "czk" : "eur";
  const full = AMOUNTS[id].month[loc] * 12;
  const save = full - AMOUNTS[id].year[loc];
  return { amount: money(save), pct: Math.round((save / full) * 100) };
}
