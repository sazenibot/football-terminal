import type { ReactNode } from "react";
import { Link } from "../i18n/router";
import { t } from "../i18n/locale";
import { useAccess } from "./AccessContext";
import { FEATURES, allows as tierAllows, tierName, type Feature, type Tier } from "./tiers";

/** Odznak "kde to patří" u zamčených věcí. */
export function TierBadge({ tier, className = "" }: { tier: Tier; className?: string }) {
  if (tier === "anon") return null;
  const pro = tier === "pro";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${className}`}
      style={{
        color: pro ? "var(--c-away)" : "var(--c-accent)",
        background: `color-mix(in oklab, ${pro ? "var(--c-away)" : "var(--c-accent)"} 14%, transparent)`,
      }}
    >
      <span aria-hidden>🔒</span>
      {tierName(tier)}
    </span>
  );
}

/** Výzva místo zamčeného obsahu. */
export function Paywall({ need, title, text, compact = false }: { need: Tier; title?: string; text?: ReactNode; compact?: boolean }) {
  const { tier } = useAccess();
  const wantsAccount = need === "account";
  return (
    <div
      role="note"
      className={`rounded-2xl border border-(--c-line) bg-(--c-surface)/95 text-center shadow-lg backdrop-blur ${compact ? "px-4 py-4" : "px-5 py-6"}`}
    >
      <TierBadge tier={need} />
      <h3 className="mt-2 text-[15px] font-semibold text-(--c-text)">{title ?? t("gate.title", { tier: tierName(need) })}</h3>
      <p className="mx-auto mt-1 max-w-md text-[13px] leading-snug text-(--c-muted)">
        {text ?? (wantsAccount ? t("gate.textAccount") : t("gate.text", { tier: tierName(need), current: tierName(tier) }))}
      </p>
      <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
        {wantsAccount && tier === "anon" ? (
          <Link to="/prihlaseni" className="inline-flex min-h-9 items-center rounded-xl btn-accent px-4 text-[13px] font-semibold hover:opacity-90">
            {t("gate.register")}
          </Link>
        ) : (
          <Link to="/tarify" className="inline-flex min-h-9 items-center rounded-xl btn-accent px-4 text-[13px] font-semibold hover:opacity-90">
            {t("gate.seePlans")}
          </Link>
        )}
        {wantsAccount && tier === "anon" && (
          <Link to="/tarify" className="inline-flex min-h-9 items-center rounded-xl border border-(--c-line) px-4 text-[13px] font-medium text-(--c-text) hover:border-(--c-faint)">
            {t("gate.comparePlans")}
          </Link>
        )}
      </div>
    </div>
  );
}

type GateProps = {
  /** Klíč z FEATURES. Nebo přímo minimální tarif přes `need`. */
  feature?: Feature;
  need?: Tier;
  /** blur: obsah pod rozmazáním jako ukázka. replace: obsah se vůbec nevykreslí. */
  mode?: "blur" | "replace";
  title?: string;
  text?: ReactNode;
  /** Zamyká se jen, když je true. Hodí se pro "první dvě části zdarma". */
  when?: boolean;
  children: ReactNode;
};

/** Skryje obsah, pokud tarif nestačí. Zdroj pravdy je FEATURES v tiers.ts. */
export function Gate({ feature, need, mode = "blur", title, text, when = true, children }: GateProps) {
  const { tier } = useAccess();
  const min = need ?? (feature ? FEATURES[feature].min : "anon");
  const open = !when || tierAllows(tier, min);
  if (open) return <>{children}</>;
  if (mode === "replace") return <Paywall need={min} title={title} text={text} />;
  return (
    <div className="relative">
      <div aria-hidden className="pointer-events-none max-h-[34rem] select-none overflow-hidden opacity-70 blur-[6px]">
        {children}
      </div>
      <div className="absolute inset-0 flex items-start justify-center bg-gradient-to-b from-transparent via-(--c-page)/60 to-(--c-page)/90 px-4 pt-10">
        <div className="sticky top-24 w-full max-w-md">
          <Paywall need={min} title={title} text={text} />
        </div>
      </div>
    </div>
  );
}
