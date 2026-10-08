import { BrowserRouter, Navigate, Route, Routes, useLocation, useParams, useSearchParams } from "./i18n/router";
import { RoundPage } from "./pages/RoundPage";
import { MatchCenterLabRedirect, MatchRoute } from "./pages/MatchRoute";
import { HomePage } from "./pages/HomePage";
import { CatalogPage } from "./pages/CatalogPage";
import { CatalogTeamPage } from "./pages/CatalogTeamPage";
import { CatalogPlayerPage } from "./pages/CatalogPlayerPage";
import { CatalogRefereePage } from "./pages/CatalogRefereePage";
import { AllMatchesPage, MatchListPage } from "./pages/MatchListPage";
import { ArticlePage, ArticlesPage } from "./pages/ArticlesPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { PricingPage } from "./pages/PricingPage";
import { ResultsPage } from "./pages/ResultsPage";
import { LoginPage } from "./pages/LoginPage";
import { LegalPage } from "./pages/LegalPage";
import { AccessProvider } from "./access/AccessContext";
import { ViewAsSwitcher } from "./access/ViewAsSwitcher";
import { DEV_TOOLS, PRICING_OPEN } from "./lib/flags";
import { SiteFooter, SiteNav, TopRight } from "./site/shell";
import { Suspense, lazy, useEffect } from "react";
import { Navigate as RawNavigate } from "react-router-dom";
import { lastLeagueId } from "./components/LeagueSwitcher";
import { useDataIndex } from "./lib/useData";
import { isLiveLeague } from "./lib/pitchMatch";
import { LocaleProvider, seg, useLocale } from "./i18n";
import { localizePath, t } from "./i18n/locale";

/** Lab je jen pro vývoj. Dynamický import pod `import.meta.env.DEV` se v produkčním buildu odstraní celý. */
const LabRoutes = import.meta.env.DEV ? lazy(() => import("./pages/LabRoutes")) : null;

function LeagueRoute() {
  const { leagueId } = useParams();
  const [sp] = useSearchParams();
  const { index } = useDataIndex();
  // ?classic=1 = nouzový návrat ke starému výpisu kola
  if (leagueId === "all") return <AllMatchesPage base="/league" />;
  if (sp.get("classic") === "1" && leagueId) return <RoundPage leagueId={Number(leagueId)} />;
  const saved = lastLeagueId();
  const fallback = saved && isLiveLeague(index?.leagues, saved) ? saved : (index?.default_league_id ?? 262);
  const id = Number(leagueId) || fallback;
  if (index && leagueId && !index.leagues.some((l) => l.id === id)) return <NotFoundPage text={t("nf.league")} />;
  return <MatchListPage leagueId={id} base="/league" />;
}

function LabListRedirect() {
  const { leagueId } = useParams();
  return <Navigate to={`/league/${leagueId}`} replace />;
}

function LabMatchRedirect() {
  const { fixtureId } = useParams();
  return <Navigate to={`/match/${fixtureId}`} replace />;
}

/** Neznámá adresa: když jen míchá jazyky (např. /cs/results), přesměruje na správný tvar, jinak 404. */
function Fallback() {
  const { pathname, search, hash } = useLocation();
  const { locale } = useLocale();
  const target = localizePath(pathname, locale);
  if (target !== pathname) return <RawNavigate to={target + search + hash} replace />;
  return <NotFoundPage />;
}

function ScrollTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

/** Všechny stránky. Adresy se liší jen u pár segmentů (clanky/articles apod.), jazykovou předponu /cs řeší nadřazená routa. */
function AppRoutes() {
  const { locale } = useLocale();
  const p = (cz: string) => `/${seg(cz, locale)}`;
  return (
    <Routes>
      <Route path={p("clanky")} element={<ArticlesPage />} />
      <Route path={`${p("clanky")}/:slug`} element={<ArticlePage />} />
      <Route path={p("tarify")} element={PRICING_OPEN ? <PricingPage /> : <Navigate to="/" replace />} />
      <Route path={p("vysledky")} element={<ResultsPage />} />
      <Route path={p("prihlaseni")} element={<LoginPage />} />
      <Route path={p("obchodni-podminky")} element={<LegalPage slug="obchodni-podminky" />} />
      <Route path={p("ochrana-udaju")} element={<LegalPage slug="ochrana-udaju" />} />
      <Route path={p("kontakt")} element={<LegalPage slug="kontakt" />} />
      <Route path="/" element={<HomePage />} />
      <Route path="/league" element={<LeagueRoute />} />
      <Route path="/league/:leagueId" element={<LeagueRoute />} />
      <Route path="/match/:fixtureId" element={<MatchRoute />} />
      <Route path="/catalog" element={<CatalogPage />} />
      <Route path="/catalog/teams/:id" element={<CatalogTeamPage />} />
      <Route path="/catalog/players/:id" element={<CatalogPlayerPage />} />
      <Route path="/catalog/referees/:id" element={<CatalogRefereePage />} />
      <Route path="/katalog" element={<Navigate to="/catalog" replace />} />
      <Route path="/katalog/*" element={<Navigate to="/catalog" replace />} />
      {LabRoutes ? (
        <Route
          path="/lab/*"
          element={
            <Suspense fallback={null}>
              <LabRoutes />
            </Suspense>
          }
        />
      ) : (
        <Route path="/lab/*" element={<Navigate to="/" replace />} />
      )}
      <Route path="/lab/match-center-list" element={<Navigate to="/league" replace />} />
      <Route path="/lab/match-center-list/:leagueId" element={<LabListRedirect />} />
      <Route path="/lab/match-center-2" element={<MatchCenterLabRedirect />} />
      <Route path="/lab/match-center-2/:fixtureId" element={<MatchCenterLabRedirect />} />
      <Route path="/lab/match" element={<Navigate to="/league/262" replace />} />
      <Route path="/lab/match/:fixtureId" element={<LabMatchRedirect />} />
      <Route path="*" element={<Fallback />} />
    </Routes>
  );
}

/** Staré adresy: /en/… (dřívější anglická verze) jde na kořen, české segmenty v kořeni (/clanky…) pod /cs.
    Na hostingu to dělá 301 `public/_redirects`, tohle je záloha pro dev a SPA navigaci. */
function LegacyEn() {
  const { pathname, search, hash } = useLocation();
  return <RawNavigate to={(pathname.replace(/^\/en/, "") || "/") + search + hash} replace />;
}

function LegacyCs() {
  const { pathname, search, hash } = useLocation();
  return <RawNavigate to={"/cs" + pathname + search + hash} replace />;
}

function Localized({ locale }: { locale: "cs" | "en" }) {
  return (
    <LocaleProvider locale={locale}>
      <ScrollTop />
      <SiteNav />
      <TopRight />
      <AppRoutes />
      <SiteFooter />
      {DEV_TOOLS && <ViewAsSwitcher />}
    </LocaleProvider>
  );
}

function App() {
  return (
    <AccessProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/cs/*" element={<Localized locale="cs" />} />
          <Route path="/en/*" element={<LegacyEn />} />
          <Route path="/en" element={<LegacyEn />} />
          {["clanky", "tarify", "vysledky", "prihlaseni", "obchodni-podminky", "ochrana-udaju", "kontakt"].flatMap((s) => [
            <Route key={s} path={`/${s}`} element={<LegacyCs />} />,
            <Route key={`${s}/*`} path={`/${s}/*`} element={<LegacyCs />} />,
          ])}
          <Route path="*" element={<Localized locale="en" />} />
        </Routes>
      </BrowserRouter>
    </AccessProvider>
  );
}

export default App;
