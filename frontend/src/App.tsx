import { BrowserRouter, Navigate, Route, Routes, useLocation, useParams, useSearchParams } from "react-router-dom";
import { RoundPage } from "./pages/RoundPage";
import { MatchCenterLabRedirect, MatchRoute } from "./pages/MatchRoute";
import { HomePage } from "./pages/HomePage";
import { CatalogPage } from "./pages/CatalogPage";
import { CatalogTeamPage } from "./pages/CatalogTeamPage";
import { CatalogPlayerPage } from "./pages/CatalogPlayerPage";
import { CatalogRefereePage } from "./pages/CatalogRefereePage";
import { LabPage } from "./pages/LabPage";
import { LabTrendmetrPage } from "./pages/LabTrendmetrPage";
import { LabXDataPage } from "./pages/LabXDataPage";
import { LabPitchVsTsPage } from "./pages/LabPitchVsTsPage";
import { MatchListPage } from "./pages/MatchListPage";
import { LabMatchListPage } from "./pages/LabMatchListPage";
import { LabPitchModelsPage } from "./pages/LabPitchModelsPage";
import { ArticlePage, ArticlesPage } from "./pages/ArticlesPage";
import { PricingPage } from "./pages/PricingPage";
import { ResultsPage } from "./pages/ResultsPage";
import { LoginPage } from "./pages/LoginPage";
import { AccessProvider } from "./access/AccessContext";
import { ViewAsSwitcher } from "./access/ViewAsSwitcher";
import { SiteFooter, SiteNav, TopRight } from "./site/shell";
import { useEffect } from "react";
import { lastLeagueId } from "./components/LeagueSwitcher";
import { useDataIndex } from "./lib/useData";
import { hasPitchData } from "./lib/pitchMatch";

function LeagueRoute() {
  const { leagueId } = useParams();
  const [sp] = useSearchParams();
  const { index } = useDataIndex();
  // ?classic=1 = nouzový návrat ke starému výpisu kola
  if (sp.get("classic") === "1" && leagueId) return <RoundPage leagueId={Number(leagueId)} />;
  const saved = lastLeagueId();
  const fallback = saved && hasPitchData(saved) ? saved : (index?.default_league_id ?? 262);
  const id = Number(leagueId) || fallback;
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

function ScrollTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

function App() {
  return (
    <AccessProvider>
    <BrowserRouter>
      <ScrollTop />
      <SiteNav />
      <TopRight />
      <Routes>
        <Route path="/clanky" element={<ArticlesPage />} />
        <Route path="/clanky/:slug" element={<ArticlePage />} />
        <Route path="/tarify" element={<PricingPage />} />
        <Route path="/vysledky" element={<ResultsPage />} />
        <Route path="/prihlaseni" element={<LoginPage />} />
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
        <Route path="/lab" element={<LabPage />} />
        <Route path="/lab/trendmetr" element={<LabTrendmetrPage />} />
        <Route path="/lab/xdata" element={<LabXDataPage />} />
        <Route path="/lab/api" element={<Navigate to="/lab" replace />} />
        <Route path="/lab/api/sm-pitch" element={<Navigate to="/lab" replace />} />
        <Route path="/lab/api/pitch" element={<LabPitchVsTsPage />} />
        <Route path="/lab/match-list" element={<LabMatchListPage />} />
        <Route path="/lab/pitch-models" element={<LabPitchModelsPage />} />
        <Route path="/lab/match-center-list" element={<Navigate to="/league" replace />} />
        <Route path="/lab/match-center-list/:leagueId" element={<LabListRedirect />} />
        <Route path="/lab/match-center-2" element={<MatchCenterLabRedirect />} />
        <Route path="/lab/match-center-2/:fixtureId" element={<MatchCenterLabRedirect />} />
        <Route path="/lab/match" element={<Navigate to="/league/262" replace />} />
        <Route path="/lab/match/:fixtureId" element={<LabMatchRedirect />} />
      </Routes>
      <SiteFooter />
      <ViewAsSwitcher />
    </BrowserRouter>
    </AccessProvider>
  );
}

export default App;
