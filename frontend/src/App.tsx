import { BrowserRouter, Navigate, Route, Routes, useParams } from "react-router-dom";
import { RoundPage } from "./pages/RoundPage";
import { MatchPage } from "./pages/MatchPage";
import { HomePage } from "./pages/HomePage";
import { CatalogPage } from "./pages/CatalogPage";
import { CatalogTeamPage } from "./pages/CatalogTeamPage";
import { CatalogPlayerPage } from "./pages/CatalogPlayerPage";
import { CatalogRefereePage } from "./pages/CatalogRefereePage";
import { LabPage } from "./pages/LabPage";
import { LabTrendmetrPage } from "./pages/LabTrendmetrPage";
import { ThemeToggle } from "./components/ThemeToggle";
import { AppNav } from "./components/AppNav";

function LeagueRoute() {
  const { leagueId } = useParams();
  return <RoundPage leagueId={Number(leagueId)} />;
}

function App() {
  return (
    <BrowserRouter>
      <AppNav />
      <ThemeToggle />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/league/:leagueId" element={<LeagueRoute />} />
        <Route path="/match/:fixtureId" element={<MatchPage />} />
        <Route path="/catalog" element={<CatalogPage />} />
        <Route path="/catalog/teams/:id" element={<CatalogTeamPage />} />
        <Route path="/catalog/players/:id" element={<CatalogPlayerPage />} />
        <Route path="/catalog/referees/:id" element={<CatalogRefereePage />} />
        <Route path="/katalog" element={<Navigate to="/catalog" replace />} />
        <Route path="/katalog/*" element={<Navigate to="/catalog" replace />} />
        <Route path="/lab" element={<LabPage />} />
        <Route path="/lab/trendmetr" element={<LabTrendmetrPage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
