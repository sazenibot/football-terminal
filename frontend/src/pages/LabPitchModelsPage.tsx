import { useState } from "react";
import { Link } from "../i18n/router";
import { KeeperCard, ShotMap, TeamTrend, pitchSeasonOpts } from "../components/PitchCards";
import { Back, Frame } from "../cat/kit";
import { KeeperCardV2, ShotMapCard, TrendCard } from "../cat/PitchViz";
import { usePitchPlayer, usePitchTeam } from "../lib/useData";
import { Seg } from "../mc2/kit";

/** Návrh přepracování grafů z PitchAPI. Stejná data jako v katalogu, vedle sebe dnešek a návrh. */
export function LabPitchModelsPage() {
  const [what, setWhat] = useState<"team" | "shots" | "keeper">("team");
  const [version, setVersion] = useState<"new" | "old">("new");
  const team = usePitchTeam(216);
  const striker = usePitchPlayer(80707);
  const keeper = usePitchPlayer(9939100);

  return (
    <Frame>
      <Back to="/lab">Lab</Back>
      <h1 className="mt-3 text-2xl font-bold text-(--c-text)">Grafy z PitchAPI: návrh přepracování</h1>
      <p className="mt-1 max-w-2xl text-sm text-(--c-muted)">
        Trend střelby, mapa střel a karta brankáře na živých datech Slavie, Chorého a Markoviče. Přepínač nahoře ukáže návrh a dnešní podobu.
        Přepněte i světlý režim a mobil, tam je rozdíl nejvíc vidět.
      </p>

      <div className="mt-4 flex flex-wrap gap-3">
        <Seg
          label="Co ukázat"
          value={what}
          onChange={setWhat}
          options={[
            { id: "team", label: "Trend týmu" },
            { id: "shots", label: "Mapa střel" },
            { id: "keeper", label: "Brankář" },
          ]}
        />
        <Seg
          label="Verze"
          value={version}
          onChange={setVersion}
          options={[
            { id: "new", label: "Návrh" },
            { id: "old", label: "Dnes" },
          ]}
        />
      </div>

      <div className="mt-4">
        {what === "team" && team && version === "new" && <TrendCard team="Slavia Praha" seasons={pitchSeasonOpts(team.season, team.matches)} defaultSeason={team.season} />}
        {what === "team" && team && version === "old" && (
          <div className="catalog-legacy">
            <TeamTrend seasons={pitchSeasonOpts(team.season, team.matches)} defaultSeason={team.season} team="Slavia Praha" />
          </div>
        )}

        {what === "shots" && team && version === "new" && (
          <ShotMapCard title="Mapa střel týmu" lead="Odkud Slavia střílí. Branka je nahoře, velikost tečky je xG střely." seasons={pitchSeasonOpts(team.season, team.matches)} defaultSeason={team.season} shotsOf={(m) => m.shots} />
        )}
        {what === "shots" && team && version === "old" && (
          <div className="catalog-legacy">
            <ShotMap
              title="Shotmapa týmu"
              lead="Branka nahoře. Barva říká, jestli šlo o střelu ze hry, nebo ze standardky. Kroužek je gól, světlejší tečka mimo bránu."
              seasons={pitchSeasonOpts(team.season, team.matches)}
              defaultSeason={team.season}
              shotsOf={(m) => m.shots}
            />
          </div>
        )}

        {what === "keeper" && keeper && version === "new" && <KeeperCardV2 name="Jakub Markovič" seasons={pitchSeasonOpts(keeper.season, keeper.matches)} defaultSeason={keeper.season} showSeason={false} />}
        {what === "keeper" && keeper && version === "old" && (
          <div className="catalog-legacy">
            <KeeperCard seasons={pitchSeasonOpts(keeper.season, keeper.matches)} defaultSeason={keeper.season} name="Jakub Markovič" showSeason={false} />
          </div>
        )}

        {!team && !keeper && !striker && <p className="py-10 text-center text-sm text-(--c-muted)">Načítám data…</p>}
      </div>

      <p className="mt-6 text-sm text-(--c-muted)">
        V katalogu zatím běží dnešní verze:{" "}
        <Link to="/catalog/teams/216" className="text-(--c-accent) hover:underline">
          Slavia
        </Link>
        ,{" "}
        <Link to="/catalog/players/80707" className="text-(--c-accent) hover:underline">
          Chorý
        </Link>
        ,{" "}
        <Link to="/catalog/players/9939100" className="text-(--c-accent) hover:underline">
          Markovič
        </Link>
        .
      </p>
    </Frame>
  );
}
