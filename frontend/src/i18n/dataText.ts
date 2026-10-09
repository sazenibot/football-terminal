import { getLocale } from "./locale";

/* České texty, které vznikají už při stahování dat (Python skripty je zapisují do JSON).
   V češtině se vrací beze změny, v angličtině se překládají tady, takže stačí jedna vrstva ve webu
   a nic se nemusí přegenerovávat. Neznámý text projde nezměněný (lepší česky než prázdno). */

/** Základy názvů ukazatelů (bez „/zápas“, „%“ a podobných přípon). */
const STEM: Record<string, string> = {
  "Góly": "Goals",
  "Střely": "Shots",
  "Střely na branku": "Shots on target",
  "Střely na bránu": "Shots on target",
  "Na bránu": "On target",
  "Na branku": "On target",
  "Mimo": "Off target",
  "Z vápna": "From inside the box",
  "Mimo vápno": "From outside the box",
  "Zblokované": "Blocked",
  "Zblokované soupeřem": "Blocked by opponent",
  "Držení": "Possession",
  "Útoky": "Attacks",
  "Nebezpečné útoky": "Dangerous attacks",
  "Velké šance": "Big chances",
  "Zahozené velké šance": "Big chances missed",
  "Asistence": "Assists",
  "Klíčové přihrávky": "Key passes",
  "Přihrávky": "Passes",
  "Úspěšnost přihrávek": "Pass accuracy",
  "Driblingy": "Dribbles",
  "Úspěšné driblingy": "Successful dribbles",
  "Úspěšnost driblingu": "Dribble success rate",
  "Zápasy bez gólu": "Matches without a goal",
  "Obdrženo": "Conceded",
  "Zákroky": "Saves",
  "Skluzy": "Tackles",
  "Vyhrané skluzy": "Tackles won",
  "Zachycené přihrávky": "Interceptions",
  "Vyhrané souboje": "Duels won",
  "Čistá konta": "Clean sheets",
  "Fauly": "Fouls",
  "Fauly proti": "Fouls suffered",
  "Žluté": "Yellows",
  "Červené": "Reds",
  "Karty": "Cards",
  "Žluté karty": "Yellow cards",
  "Červené karty": "Red cards",
  "Druhá žlutá": "Second yellows",
  "Rohy": "Corners",
  "Standardky": "Set pieces",
  "Auty": "Throw-ins",
  "Výkopy": "Goal kicks",
  "Centry": "Crosses",
  "Přesné centry": "Accurate crosses",
  "Ofsajdy": "Offsides",
  "Penalty": "Penalties",
  "Použití VAR": "VAR reviews",
};

/** Celé věty (štítky trendů a podobně), které se nedají složit ze základů. */
const EXACT: Record<string, string> = {
  "5+ žlutých karet v zápase (celkem)": "5+ yellow cards in the match (total)",
  "Méně než 5 žlutých karet v zápase (celkem)": "Fewer than 5 yellow cards in the match (total)",
  "Oba týmy skórovaly (BTTS)": "Both teams scored (BTTS)",
  "Over 1.5 gólů v zápase": "Over 1.5 goals in the match",
  "Over 2.5 gólů v zápase": "Over 2.5 goals in the match",
  "Under 2.5 gólů v zápase": "Under 2.5 goals in the match",
  "Over 9.5 rohů v zápase (celkem)": "Over 9.5 corners in the match (total)",
  "Under 9.5 rohů v zápase (celkem)": "Under 9.5 corners in the match (total)",
  "Padla červená karta (kterýkoli tým)": "A red card was shown (either team)",
  "Remíza v poločase": "Level at half-time",
  "Tým dostal 2+ žluté karty": "Team got 2+ yellow cards",
  "Tým měl víc rohů než soupeř": "Team had more corners than the opponent",
  "Tým nevstřelil gól": "Team did not score",
  "Tým prohrával po 1. poločase": "Team was behind at half-time",
  "Tým vedl po 1. poločase": "Team led at half-time",
  "Tým vstřelil 2+ gólů": "Team scored 2+ goals",
  "Čisté konto (0 obdržených gólů)": "Clean sheet (0 goals conceded)",
};

const POSITION: Record<string, string> = {
  Brankář: "Goalkeeper",
  Obránce: "Defender",
  Záložník: "Midfielder",
  Útočník: "Forward",
};

const stem = (s: string) => STEM[s] ?? s;

/** Štítek ukazatele z dat: „Střely/zápas“, „Fauly: 10.5+ v zápase“, „Čistá konta %“. */
export function dataLabel(label: string): string {
  if (getLocale() !== "en") return label;
  const exact = EXACT[label];
  if (exact) return exact;
  let m = label.match(/^(.+?): méně než (-?[\d.]+) v zápase$/);
  if (m) return `${stem(m[1])}: under ${m[2]} in the match`;
  m = label.match(/^(.+?): (-?[\d.]+)\+ v zápase$/);
  if (m) return `${stem(m[1])}: ${m[2]}+ in the match`;
  m = label.match(/^(.+)\/zápas$/);
  if (m) return `${stem(m[1])} per match`;
  m = label.match(/^(.+) %$/);
  if (m) return `${stem(m[1])} %`;
  return STEM[label] ?? label;
}

/** Pozice hráče z dat (Brankář, Obránce, Záložník, Útočník). */
export function dataPosition(pos: string | null | undefined): string {
  if (!pos) return "";
  return getLocale() === "en" ? (POSITION[pos] ?? pos) : pos;
}

/** Důvody absencí, které v už vygenerovaných zápasech zůstaly anglicky. Nové zápasy je mají přeložené při ingestu. */
const INJURY_EXTRA: Record<string, string> = {
  "Back Problems": "Problémy se zády",
  "Muscular problems": "Svalové problémy",
  "Knock": "Menší zranění",
  "Suspension Through Sports Court": "Trest od disciplinární komise",
  "Knee Problems": "Problémy s kolenem",
  "Tendon Rupture": "Přetržená šlacha",
  "Muscle Tear": "Natržený sval",
  "Meniscus Tear": "Poškozený meniskus",
  "Ill": "Nemoc",
  "Outer Ligament Problems": "Problémy s vnějším vazem",
  "Achilles tendon problems": "Problémy s Achillovou šlachou",
  "Syndesmosis Ligament Tear": "Natržený vaz (syndesmóza)",
  "Meniscus Injury": "Zranění menisku",
  "Adductor Injury": "Zranění adduktoru",
  "Minor Knock": "Drobné zranění",
  "Surgery": "Operace",
  "Inner Knee Ligament Tear": "Natržený vnitřní vaz kolena",
  "Ankle Problems": "Problémy s kotníkem",
  "Torn Muscle Bundle": "Natržený svalový snop",
  "Food Poisoning": "Otrava jídlem",
};

/** Jména, u kterých zdroj posílá podobu bez diakritiky. */
const NAME_FIXES: Record<string, string> = {
  "Tomas Chory": "Tomáš Chorý",
  "Jindrich Stanek": "Jindřich Staněk",
  "Stepan Chaloupek": "Štěpán Chaloupek",
  "Zdenek Houstecky": "Zdeněk Houštěcký",
};

export function displayName(name: string): string {
  return NAME_FIXES[name] ?? name;
}

/** Český důvod absence: z dat, a když tam zůstala angličtina, z doplňkového slovníku. */
export function injuryCs(en: string, cs?: string | null): string {
  if (cs && cs !== en) return cs;
  return INJURY_EXTRA[en] ?? cs ?? en;
}
