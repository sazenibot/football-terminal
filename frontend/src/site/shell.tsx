import { useState, type ReactNode } from "react";
import { Link as RawLink, useLocation as useRawLocation } from "react-router-dom";
import { LANG_KEY, localizePath, t, useBarePath, useLocale, type Locale } from "../i18n";
import { Link } from "../i18n/router";
import { useAccess } from "../access/AccessContext";
import { tierName } from "../access/tiers";
import { ThemeToggle } from "../components/ThemeToggle";
import { defaultLeaguePath } from "../components/LeagueSwitcher";
import { DEV_TOOLS, PRICING_OPEN } from "../lib/flags";

const PILL = "rounded-full border border-slate-700 bg-[#12161f] shadow-lg light:bg-white light:border-slate-300";

/** Přepínač CZ | EN. Stejná stránka v druhém jazyce, volba se pamatuje. */
export function LangSwitch() {
  const { locale } = useLocale();
  const { pathname, search, hash } = useRawLocation();
  const opts: Locale[] = ["cs", "en"];
  return (
    <div role="group" aria-label={t("lang.aria")} className={`${PILL} flex items-center p-0.5 text-xs font-semibold`}>
      {opts.map((l) => (
        <RawLink
          key={l}
          to={localizePath(pathname, l) + search + hash}
          hrefLang={l}
          lang={l}
          aria-current={l === locale ? "true" : undefined}
          title={t(l === "cs" ? "lang.csName" : "lang.enName")}
          onClick={() => {
            try {
              localStorage.setItem(LANG_KEY, l);
            } catch {
              /* soukromý režim apod. */
            }
          }}
          className={`rounded-full px-2.5 py-1 transition-colors ${
            l === locale ? "bg-emerald-500 text-black" : "text-slate-300 hover:text-white light:text-slate-600 light:hover:text-slate-900"
          }`}
        >
          {t(l === "cs" ? "lang.cs" : "lang.en")}
        </RawLink>
      ))}
    </div>
  );
}

export function SiteNav() {
  const pathname = useBarePath();
  const { locale } = useLocale();
  const [more, setMore] = useState(false);
  const { tier } = useAccess();
  const center = defaultLeaguePath(locale);
  const is = (p: string) => pathname === p || pathname.startsWith(p + "/");

  const item = (to: string, label: ReactNode, active: boolean, extra = "") => (
    <Link
      to={to}
      onClick={() => setMore(false)}
      className={`rounded-full px-2.5 py-2 text-xs font-medium transition-colors sm:px-3 sm:py-1.5 ${extra} ${
        active ? "bg-emerald-500 text-black" : "text-slate-300 hover:text-white light:text-slate-600 light:hover:text-slate-900"
      }`}
    >
      {label}
    </Link>
  );

  const secondary = [
    { to: "/clanky", label: t("nav.articles"), on: is("/clanky") },
    { to: "/vysledky", label: t("nav.results"), on: is("/vysledky") },
    { to: "/detektor-trendu", label: t("nav.trends"), on: is("/detektor-trendu") },
    ...(PRICING_OPEN ? [{ to: "/tarify", label: t("nav.pricing"), on: is("/tarify") }] : []),
    ...(import.meta.env.DEV ? [{ to: "/lab", label: t("nav.lab"), on: is("/lab") }] : []),
  ];

  return (
    <nav aria-label={t("nav.aria")} className={`fixed top-3 left-3 z-50 ${PILL} px-1.5 py-1`}>
      <div className="flex items-center gap-1">
        {item(
          "/",
          <>
            <span className="sm:hidden">{t("nav.home")}</span>
            <span className="hidden sm:inline">{t("nav.brand")}</span>
          </>,
          pathname === "/",
        )}
        {item(center, t("nav.matchCenter"), is("/league") || is("/match"))}
        {item("/catalog", t("nav.catalog"), is("/catalog") || is("/katalog"))}
        {secondary.map((s) => item(s.to, s.label, s.on, "hidden lg:inline-block"))}
        <button
          type="button"
          aria-label={t("nav.morePages")}
          aria-expanded={more}
          onClick={() => setMore((v) => !v)}
          className="rounded-full px-2.5 py-2 text-xs font-medium text-slate-300 hover:text-white sm:py-1.5 lg:hidden light:text-slate-600"
        >
          {t("nav.more")}
        </button>
      </div>
      {more && (
        <div className={`absolute left-0 top-full mt-2 flex min-w-40 flex-col gap-0.5 p-1.5 lg:hidden ${PILL} rounded-2xl`}>
          {secondary.map((s) => item(s.to, s.label, s.on, "block"))}
          {DEV_TOOLS && item(tier === "anon" ? "/prihlaseni" : "/tarify", tier === "anon" ? t("nav.login") : t("nav.account", { tier: tierName(tier) }), false, "block sm:hidden")}
          {/* Na mobilu se pro jazyk a motiv nevejde místo vedle menu, proto jsou tady. */}
          <div className="mt-1 flex items-center justify-between gap-2 border-t border-slate-700 px-1 pt-2 sm:hidden light:border-slate-200">
            <LangSwitch />
            <ThemeToggle />
          </div>
        </div>
      )}
    </nav>
  );
}

export function TopRight() {
  const { tier } = useAccess();
  return (
    <div className="fixed top-3 right-3 z-50 hidden items-center gap-2 sm:flex">
      {/* Štítek tarifu a Přihlásit jen ve vývoji. Na produkci host = anon, účty ještě nejsou. */}
      {DEV_TOOLS && (
        <Link
          to={tier === "anon" ? "/prihlaseni" : "/tarify"}
          className={`${PILL} px-3 py-1.5 text-xs font-medium text-slate-200 transition-colors hover:border-emerald-500 light:text-slate-700`}
        >
          {tier === "anon" ? t("nav.login") : <>{t("nav.account", { tier: "" })}<b className="text-emerald-400 light:text-emerald-700">{tierName(tier)}</b></>}
        </Link>
      )}
      <LangSwitch />
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
          <p className="font-semibold text-(--c-text)">{t("nav.brand")}</p>
          <p className="mt-1 text-(--c-muted)">{t("footer.tagline")}</p>
        </div>
        <FooterCol title={t("footer.product")}>
          <Link className={link} to="/league">{t("footer.matchCenter")}</Link>
          <Link className={link} to="/catalog">{t("footer.catalog")}</Link>
          <Link className={link} to="/vysledky">{t("footer.results")}</Link>
          <Link className={link} to="/detektor-trendu">{t("footer.trends")}</Link>
        </FooterCol>
        <FooterCol title={t("footer.service")}>
          <Link className={link} to="/clanky">{t("footer.articles")}</Link>
          <Link className={link} to="/clanky/jak-funguje-simulace">{t("footer.methodology")}</Link>
          {PRICING_OPEN && <Link className={link} to="/tarify">{t("footer.pricing")}</Link>}
        </FooterCol>
        <FooterCol title={t("footer.legal")}>
          <Link className={link} to="/obchodni-podminky">{t("footer.terms")}</Link>
          <Link className={link} to="/ochrana-udaju">{t("footer.privacy")}</Link>
        </FooterCol>
      </div>
      <p className="mt-8 text-[12px] leading-relaxed text-(--c-faint)">
        {t("footer.disclaimer")}
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
