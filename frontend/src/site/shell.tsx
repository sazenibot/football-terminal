import { useState, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAccess } from "../access/AccessContext";
import { tierName } from "../access/tiers";
import { ThemeToggle } from "../components/ThemeToggle";
import { lastLeagueId } from "../components/LeagueSwitcher";
import { useDataIndex } from "../lib/useData";

const PILL = "rounded-full border border-slate-700 bg-[#12161f] shadow-lg light:bg-white light:border-slate-300";

export function SiteNav() {
  const { pathname } = useLocation();
  const { index } = useDataIndex();
  const [more, setMore] = useState(false);
  const { tier } = useAccess();
  const saved = lastLeagueId();
  const center = `/league/${saved && Number.isFinite(saved) ? saved : (index?.default_league_id ?? 262)}`;
  const is = (p: string) => pathname === p || pathname.startsWith(p + "/");

  const item = (to: string, label: ReactNode, active: boolean, extra = "") => (
    <Link
      to={to}
      onClick={() => setMore(false)}
      className={`rounded-full px-2.5 py-1.5 text-xs font-medium transition-colors sm:px-3 ${extra} ${
        active ? "bg-emerald-500 text-black" : "text-slate-300 hover:text-white light:text-slate-600 light:hover:text-slate-900"
      }`}
    >
      {label}
    </Link>
  );

  const secondary = [
    { to: "/clanky", label: "Články", on: is("/clanky") },
    { to: "/vysledky", label: "Výsledky", on: is("/vysledky") },
    { to: "/tarify", label: "Tarify", on: is("/tarify") },
    { to: "/lab", label: "Lab", on: is("/lab") },
  ];

  return (
    <nav aria-label="Hlavní menu" className={`fixed top-3 left-3 z-50 ${PILL} px-1.5 py-1`}>
      <div className="flex items-center gap-1">
        {item(
          "/",
          <>
            <span className="sm:hidden">Domů</span>
            <span className="hidden sm:inline">Football Terminal</span>
          </>,
          pathname === "/",
        )}
        {item(center, "Match Center", is("/league") || is("/match"))}
        {item("/catalog", "Katalog", is("/catalog") || is("/katalog"))}
        {secondary.map((s) => item(s.to, s.label, s.on, "hidden lg:inline-block"))}
        <button
          type="button"
          aria-label="Další stránky"
          aria-expanded={more}
          onClick={() => setMore((v) => !v)}
          className="rounded-full px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:text-white lg:hidden light:text-slate-600"
        >
          Více ▾
        </button>
      </div>
      {more && (
        <div className={`absolute left-0 top-full mt-2 flex min-w-40 flex-col gap-0.5 p-1.5 lg:hidden ${PILL} rounded-2xl`}>
          {secondary.map((s) => item(s.to, s.label, s.on, "block"))}
          {item(tier === "anon" ? "/prihlaseni" : "/tarify", tier === "anon" ? "Přihlásit" : `Účet · ${tierName(tier)}`, false, "block sm:hidden")}
        </div>
      )}
    </nav>
  );
}

export function TopRight() {
  const { tier } = useAccess();
  return (
    <div className="fixed top-3 right-3 z-50 flex items-center gap-2">
      <Link
        to={tier === "anon" ? "/prihlaseni" : "/tarify"}
        className={`${PILL} hidden px-3 py-1.5 text-xs font-medium text-slate-200 transition-colors hover:border-emerald-500 sm:block light:text-slate-700`}
      >
        {tier === "anon" ? "Přihlásit" : <>Účet · <b className="text-emerald-400 light:text-emerald-700">{tierName(tier)}</b></>}
      </Link>
      <ThemeToggle />
    </div>
  );
}

export function SiteFooter() {
  const link = "text-(--c-muted) hover:text-(--c-text)";
  return (
    <footer className="mc2 mx-auto max-w-6xl border-t border-(--c-line) px-4 pb-24 pt-8 text-[13px]">
      <div className="grid gap-6 sm:grid-cols-4">
        <div>
          <p className="font-semibold text-(--c-text)">Football Terminal</p>
          <p className="mt-1 text-(--c-muted)">Fotbalová analytika. Hledáme statistiky, které se opakují.</p>
        </div>
        <FooterCol title="Produkt">
          <Link className={link} to="/league">Match Center</Link>
          <Link className={link} to="/catalog">Datový katalog</Link>
          <Link className={link} to="/vysledky">Výsledky</Link>
        </FooterCol>
        <FooterCol title="Servis">
          <Link className={link} to="/clanky">Články a návody</Link>
          <Link className={link} to="/clanky/jak-funguje-simulace">Metodika modelu</Link>
          <Link className={link} to="/tarify">Tarify</Link>
        </FooterCol>
        <FooterCol title="Právní">
          <span className="text-(--c-faint)">Obchodní podmínky (připravujeme)</span>
          <span className="text-(--c-faint)">Ochrana osobních údajů (připravujeme)</span>
          <span className="text-(--c-faint)">Kontakt (připravujeme)</span>
        </FooterCol>
      </div>
      <p className="mt-8 text-[12px] leading-relaxed text-(--c-faint)">
        Služba je určena osobám starším 18 let. Informativní údaje, nejde o doporučení k sázce ani o příslib výhry. Modelové pravděpodobnosti jsou odhad a minulá úspěšnost
        nezaručuje budoucí výsledky. Hazard může způsobit závislost.
      </p>
    </footer>
  );
}

function FooterCol({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-(--c-faint)">{title}</p>
      <div className="flex flex-col gap-1">{children}</div>
    </div>
  );
}
