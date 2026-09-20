import { BrowserRouter, Navigate, Route, Routes, useParams } from "react-router-dom";
import { useDataIndex } from "./lib/useData";
import { lastLeagueId } from "./components/LeagueSwitcher";
import { RoundPage } from "./pages/RoundPage";
import { MatchPage } from "./pages/MatchPage";
import { ThemeToggle } from "./components/ThemeToggle";

function HomeRedirect() {
  const { index, error } = useDataIndex();
  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center text-rose-400">
        Chyba při načítání katalogu lig: {error}
      </div>
    );
  }
  if (!index) {
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-400 light:text-slate-500">
        Načítám data…
      </div>
    );
  }
  const saved = lastLeagueId();
  const enabledIds = new Set(index.leagues.filter((l) => l.enabled).map((l) => l.id));
  const target = saved && enabledIds.has(saved) ? saved : index.default_league_id;
  return <Navigate to={`/league/${target}`} replace />;
}

function LeagueRoute() {
  const { leagueId } = useParams();
  return <RoundPage leagueId={Number(leagueId)} />;
}

function App() {
  return (
    <BrowserRouter>
      <ThemeToggle />
      <Routes>
        <Route path="/" element={<HomeRedirect />} />
        <Route path="/league/:leagueId" element={<LeagueRoute />} />
        <Route path="/match/:fixtureId" element={<MatchPage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
