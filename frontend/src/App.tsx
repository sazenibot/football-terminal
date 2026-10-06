import { BrowserRouter, Navigate, Route, Routes, useParams } from "react-router-dom";
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
import { LabPitchModelsPage } from "./pages/LabPitchModelsPage";
import { ThemeToggle } from "./components/ThemeToggle";
import { AppNav } from "./components/AppNav";

function LeagueRoute() {
  const { leagueId } = useParams();
  return <RoundPage leagueId={Number(leagueId)} />;
}

function LabMatchRedirect() {
  const { fixtureId } = useParams();
  return <Navigate to={`/match/${fixtureId}`} replace />;
}

function App() {
  return (
    <BrowserRouter>
      <AppNav />
      <ThemeToggle />
      <Routes>
        <Route path="/" element={<HomePage />} />
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
        <Route path="/lab/pitch-models" element={<LabPitchModelsPage />} />
        <Route path="/lab/match-center-2" element={<MatchCenterLabRedirect />} />
        <Route path="/lab/match-center-2/:fixtureId" element={<MatchCenterLabRedirect />} />
        <Route path="/lab/match" element={<Navigate to="/league/262" replace />} />
        <Route path="/lab/match/:fixtureId" element={<LabMatchRedirect />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
