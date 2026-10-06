import { useState } from "react";
import { useAccess } from "./AccessContext";
import { t } from "../i18n/locale";
import { getTiers } from "./tiers";

/** Jen pro vývoj, dokud nemáme přihlášení: ukáže web očima anonyma, účtu, Unlimited a Pro.
    Před spuštěním se odstraní (nebo schová za příznak správce). */
export function ViewAsSwitcher() {
  const { tier, setTier, freeFixture, resetFreeFixture } = useAccess();
  const [open, setOpen] = useState(false);
  const tiers = getTiers();
  const current = tiers.find((x) => x.id === tier);
  return (
    <div className="mc2 fixed bottom-3 left-3 z-50 max-w-[calc(100vw-1.5rem)]">
      {open ? (
        <div className="rounded-2xl border border-(--c-line) bg-(--c-surface) p-3 shadow-xl">
          <div className="mb-2 flex items-center justify-between gap-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-(--c-faint)">{t("view.title")}</p>
            <button type="button" onClick={() => setOpen(false)} aria-label={t("view.close")} className="text-(--c-muted) hover:text-(--c-text)">
              ✕
            </button>
          </div>
          <div role="radiogroup" aria-label={t("view.label")} className="flex flex-wrap gap-1.5">
            {tiers.map((x) => (
              <button
                key={x.id}
                type="button"
                role="radio"
                aria-checked={x.id === tier}
                onClick={() => setTier(x.id)}
                className={`min-h-8 rounded-full border px-3 text-xs font-medium transition-colors ${
                  x.id === tier ? "border-(--c-accent) bg-(--c-accent)/15 text-(--c-accent)" : "border-(--c-line) text-(--c-muted) hover:text-(--c-text)"
                }`}
              >
                {x.id === "anon" ? t("view.anon") : x.name}
              </button>
            ))}
          </div>
          {tier === "account" && (
            <p className="mt-2 text-[11px] text-(--c-muted)">
              {t("view.freeFixture", { state: freeFixture ? t("view.used", { id: freeFixture }) : t("view.unused") })}
              {freeFixture && (
                <button type="button" onClick={resetFreeFixture} className="ml-2 text-(--c-accent) hover:underline">
                  {t("view.reset")}
                </button>
              )}
            </p>
          )}
          <p className="mt-2 max-w-xs text-[11px] leading-snug text-(--c-faint)">{t("view.note")}</p>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-full border border-(--c-line) bg-(--c-surface) px-3 py-1.5 text-xs font-medium text-(--c-muted) shadow-lg hover:text-(--c-text)"
        >
          {t("view.button")} <b className="text-(--c-accent)">{tier === "anon" ? t("view.anon") : current?.name}</b>
        </button>
      )}
    </div>
  );
}
