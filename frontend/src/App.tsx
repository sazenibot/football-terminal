import { BrowserRouter, Routes, Route } from "react-router-dom";
import { useAppData } from "./lib/useData";
import { RoundPage } from "./pages/RoundPage";
import { MatchPage } from "./pages/MatchPage";
import { ThemeToggle } from "./components/ThemeToggle";

function App() {
  const { data, error } = useAppData();

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center text-rose-400">
        Chyba při načítání dat: {error}
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-400 light:text-slate-500">
        Načítám data…
      </div>
    );
  }

  return (
    <BrowserRouter>
      <ThemeToggle />
      <Routes>
        <Route path="/" element={<RoundPage data={data} />} />
        <Route path="/match/:fixtureId" element={<MatchPage data={data} />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
