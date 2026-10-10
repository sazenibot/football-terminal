import { useEffect, useState } from "react";
import { Link, useSearchParams } from "../i18n/router";
import { useAccess } from "../access/AccessContext";
import { ApiError, startCheckout, startPortal, type Session } from "../access/api";
import { planPrice, yearSave, type BillPeriod, type PaidTier } from "../access/prices";
import { FEATURES, GROUPS, TIER_ORDER, allows, featureLabel, featureNote, getTiers, groupLabel, tierName, type Feature, type FeatureGroup, type Tier } from "../access/tiers";
import { t, useLocale, type Key } from "../i18n";
import { Frame } from "../cat/kit";
import { Disclosure } from "../mc2/kit";

const HIGHLIGHTS: Record<Tier, Key[]> = {
  anon: ["pricing.hl.anon.1", "pricing.hl.anon.2", "pricing.hl.anon.3", "pricing.hl.anon.4"],
  account: ["pricing.hl.account.1", "pricing.hl.account.2", "pricing.hl.account.3", "pricing.hl.account.4", "pricing.hl.account.5"],
  unlimited: ["pricing.hl.unlimited.1", "pricing.hl.unlimited.2", "pricing.hl.unlimited.3"],
  pro: ["pricing.hl.pro.1", "pricing.hl.pro.2", "pricing.hl.pro.3", "pricing.hl.pro.4", "pricing.hl.pro.5"],
};

const FAQ: [Key, Key][] = [
  ["pricing.faq.1.q", "pricing.faq.1.a"],
  ["pricing.faq.2.q", "pricing.faq.2.a"],
  ["pricing.faq.3.q", "pricing.faq.3.a"],
  ["pricing.faq.4.q", "pricing.faq.4.a"],
  ["pricing.faq.5.q", "pricing.faq.5.a"],
];

export function PricingPage() {
  const { tier, session, payments, refresh } = useAccess();
  const [period, setPeriod] = useState<BillPeriod>("month");
  const [sp] = useSearchParams();
  const paid = sp.get("paid") === "1";
  const canceled = sp.get("canceled") === "1";
  const cards = getTiers().filter((x) => period === "month" || x.id === "pro" || x.id === "unlimited");

  useEffect(() => {
    if (!paid) return;
    const ids = [800, 2500, 6000].map((ms) => window.setTimeout(() => void refresh(), ms));
    return () => ids.forEach(clearTimeout);
  }, [paid, refresh]);

  return (
    <Frame wide>
      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-(--c-accent)">{t("pricing.eyebrow")}</p>
      <h1 className="mt-1 text-3xl font-bold">{t("pricing.title")}</h1>
      <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-(--c-muted)">
        {t("pricing.lead")}
      </p>
      {paid && <p className="mt-3 rounded-xl border border-(--c-accent)/40 bg-(--c-accent)/10 px-4 py-3 text-[13px]">{t("pricing.paid")}</p>}
      {canceled && <p className="mt-3 rounded-xl border border-(--c-line) bg-(--c-raised) px-4 py-3 text-[13px] text-(--c-muted)">{t("pricing.canceled")}</p>}

      <PeriodToggle value={period} onChange={setPeriod} />
      <p className="mt-3 max-w-xl text-[13px] text-(--c-muted)">{period === "year" ? t("pricing.yearNote") : t("pricing.monthNote")}</p>

      <div className={`mt-6 grid gap-3 ${period === "year" ? "sm:grid-cols-2 lg:max-w-3xl" : "sm:grid-cols-2 lg:grid-cols-4"}`}>
        {cards.map((x) => {
          const paid = x.id === "pro" || x.id === "unlimited" ? (x.id as PaidTier) : null;
          const save = paid && period === "year" ? yearSave(paid) : null;
          return (
            <article key={x.id} className={`flex flex-col rounded-2xl border bg-(--c-surface) p-5 ${x.featured ? "border-(--c-accent)" : "border-(--c-line)"}`}>
              <div className="flex items-center justify-between gap-2">
                {paid ? (
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-(--c-accent)">{x.name}</p>
                ) : (
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-(--c-accent)">
                    {t(x.id === "anon" ? "pricing.badge.anon" : "pricing.badge.account")}
                  </p>
                )}
                {x.featured && <span className="rounded-full bg-(--c-accent)/15 px-2 py-0.5 text-xs font-semibold text-(--c-accent)">{t("pricing.recommended")}</span>}
              </div>
              <p className="mt-2 text-3xl font-bold">{paid ? planPrice(paid, period) : t("pricing.free")}</p>
              {paid && <p className="text-[12px] text-(--c-faint)">{period === "year" ? t("pricing.perYear") : t("pricing.perMonth")}</p>}
              {save && (
                <p className="mt-2 inline-flex w-fit rounded-full bg-(--c-accent)/15 px-2.5 py-0.5 text-[12px] font-semibold text-(--c-accent)">
                  {t("pricing.save", { amount: save.amount, pct: save.pct })}
                </p>
              )}
              <p className="mt-3 text-[13px] leading-snug text-(--c-muted)">{x.tagline}</p>
              <ul className="mt-3 flex-1 space-y-1.5 text-[13px]">
                {HIGHLIGHTS[x.id].map((k) => (
                  <li key={k} className="flex gap-2">
                    <span className="text-(--c-accent)">✓</span>
                    <span>{t(k)}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-4">
                <PlanCta id={x.id} period={period} tier={tier} payments={payments} session={session} />
              </div>
            </article>
          );
        })}
      </div>

      <h2 className="mt-10 text-xl font-semibold">{t("pricing.compare")}</h2>
      <div className="mt-3 overflow-x-auto rounded-2xl border border-(--c-line) bg-(--c-surface)">
        <table className="w-full min-w-[640px] text-[13px]">
          <thead>
            <tr className="border-b border-(--c-line) text-left">
              <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-(--c-faint)">{t("pricing.feature")}</th>
              {TIER_ORDER.map((id) => (
                <th key={id} className="px-3 py-3 text-center text-[11px] font-semibold uppercase tracking-wider text-(--c-faint)">
                  {tierName(id)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {GROUPS.map((g) => (
              <GroupRows key={g} group={g} />
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="mt-10 text-xl font-semibold">{t("pricing.faq")}</h2>
      <div className="mt-3 space-y-2">
        {FAQ.map(([q, a]) => (
          <Disclosure key={q} summary={t(q)}>
            <p className="text-[13px] leading-relaxed text-(--c-muted)">{t(a)}</p>
          </Disclosure>
        ))}
      </div>
    </Frame>
  );
}

function payErr(code: string): string {
  const key = `pricing.err.${code}` as Key;
  const msg = t(key);
  return msg === String(key) ? t("pricing.err.server") : msg;
}

function PlanCta({
  id,
  period,
  tier,
  payments,
  session,
}: {
  id: Tier;
  period: BillPeriod;
  tier: Tier;
  payments: boolean;
  session: Session | null;
}) {
  const { locale } = useLocale();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const paid = id === "pro" || id === "unlimited" ? (id as PaidTier) : null;

  const go = async (kind: "checkout" | "portal") => {
    setError(null);
    setBusy(true);
    try {
      const out = kind === "portal" || (session?.has_billing && (session.tier === "pro" || session.tier === "unlimited"))
        ? await startPortal()
        : await startCheckout({ plan: paid!, period, locale });
      window.location.assign(out.url);
    } catch (err) {
      const code = err instanceof ApiError ? err.code : "server";
      if (code === "has_subscription") {
        try {
          const out = await startPortal();
          window.location.assign(out.url);
          return;
        } catch {
          /* padne na hlášku níž */
        }
      }
      setError(payErr(code));
      setBusy(false);
    }
  };

  if (id === "anon") return <span className="text-[12px] text-(--c-faint)">{t("pricing.noSignup")}</span>;
  if (id === "account") {
    if (tier === "account") {
      return <span className="inline-flex min-h-9 items-center rounded-xl border border-(--c-accent) px-4 text-[13px] font-medium text-(--c-accent)">{t("pricing.current")}</span>;
    }
    if (!session) {
      return (
        <Link to="/prihlaseni" className="inline-flex min-h-9 items-center rounded-xl btn-accent px-4 text-[13px] font-semibold hover:opacity-90">
          {t("gate.register")}
        </Link>
      );
    }
    return <span className="text-[12px] text-(--c-faint)">{t("pricing.included")}</span>;
  }
  if (!paid) return null;
  if (tier === id && session) {
    return (
      <div>
        <span className="inline-flex min-h-9 items-center rounded-xl border border-(--c-accent) px-4 text-[13px] font-medium text-(--c-accent)">{t("pricing.current")}</span>
        {session.has_billing && (
          <button type="button" disabled={busy} onClick={() => void go("portal")} className="mt-2 block text-[13px] text-(--c-accent) hover:underline disabled:opacity-50">
            {t("pricing.manage")}
          </button>
        )}
        {error && <p className="mt-2 text-[12px] text-red-500">{error}</p>}
      </div>
    );
  }
  if (!payments) {
    return <span className="inline-flex min-h-9 items-center rounded-xl border border-dashed border-(--c-line) px-4 text-[13px] text-(--c-muted)">{t("pricing.paymentsSoon")}</span>;
  }
  if (!session) {
    return (
      <Link to="/prihlaseni?next=/tarify" className="inline-flex min-h-9 items-center rounded-xl btn-accent px-4 text-[13px] font-semibold hover:opacity-90">
        {t("pricing.needLogin")}
      </Link>
    );
  }
  if (!session.email_verified) {
    return (
      <Link to="/prihlaseni" className="inline-flex min-h-9 items-center rounded-xl border border-(--c-line) px-4 text-[13px] font-medium">
        {t("pricing.needVerify")}
      </Link>
    );
  }
  const label = session.has_billing && (session.tier === "pro" || session.tier === "unlimited") ? t("pricing.change") : t("pricing.buy");
  return (
    <div>
      <button
        type="button"
        disabled={busy}
        onClick={() => void go("checkout")}
        className="inline-flex min-h-9 items-center rounded-xl btn-accent px-4 text-[13px] font-semibold hover:opacity-90 disabled:opacity-50"
      >
        {busy ? t("common.loading") : label}
      </button>
      {error && <p className="mt-2 text-[12px] text-red-500">{error}</p>}
    </div>
  );
}

function PeriodToggle({ value, onChange }: { value: BillPeriod; onChange: (v: BillPeriod) => void }) {
  return (
    <div role="radiogroup" aria-label={t("pricing.periodAria")} className="mt-6 grid max-w-xl grid-cols-2 gap-1.5 rounded-2xl border border-(--c-line) bg-(--c-raised) p-1.5">
      <button
        type="button"
        role="radio"
        aria-checked={value === "month"}
        onClick={() => onChange("month")}
        className={`flex min-h-14 flex-col items-center justify-center rounded-xl px-3 text-[15px] font-semibold transition-colors ${
          value === "month" ? "bg-(--c-accent) text-(--c-on-accent)" : "text-(--c-muted) hover:text-(--c-text)"
        }`}
      >
        {t("pricing.period.month")}
      </button>
      <button
        type="button"
        role="radio"
        aria-checked={value === "year"}
        onClick={() => onChange("year")}
        className={`flex min-h-14 flex-col items-center justify-center rounded-xl px-3 transition-colors ${
          value === "year" ? "bg-(--c-accent) text-(--c-on-accent)" : "text-(--c-muted) hover:text-(--c-text)"
        }`}
      >
        <span className="text-[15px] font-semibold leading-tight">{t("pricing.period.year")}</span>
        <span className={`text-[12px] font-medium leading-tight ${value === "year" ? "opacity-80" : "text-(--c-faint)"}`}>
          ({t("pricing.period.yearSub")})
        </span>
      </button>
    </div>
  );
}

function GroupRows({ group }: { group: FeatureGroup }) {
  const rows = (Object.keys(FEATURES) as Feature[]).filter((k) => FEATURES[k].group === group);
  return (
    <>
      <tr className="bg-(--c-raised)/50">
        <td colSpan={5} className="px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-(--c-faint)">
          {groupLabel(group)}
        </td>
      </tr>
      {rows.map((k) => {
        const min = FEATURES[k].min;
        const note = featureNote(k);
        return (
          <tr key={k} className="border-t border-(--c-line)">
            <td className="px-4 py-2.5">
              {featureLabel(k)}
              {note && <span className="block text-xs text-(--c-faint)">{note}</span>}
            </td>
            {TIER_ORDER.map((id) => (
              <td key={id} className="px-3 py-2.5 text-center">
                {allows(id, min) ? <span className="text-(--c-accent)">✓</span> : <span className="text-(--c-faint)">–</span>}
              </td>
            ))}
          </tr>
        );
      })}
    </>
  );
}
