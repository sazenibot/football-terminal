import { getLocale } from "../i18n/locale";

/** Vlajka země podle českého názvu z data/index.json. Obrázek místo emoji, protože na Windows se emoji vlajky nezobrazí (jen písmena). */

const CODES: Record<string, string> = {
  Anglie: "gb-eng",
  Skotsko: "gb-sct",
  Wales: "gb-wls",
  Belgie: "be",
  Brazílie: "br",
  Česko: "cz",
  Chorvatsko: "hr",
  Dánsko: "dk",
  Francie: "fr",
  Itálie: "it",
  Maďarsko: "hu",
  Mexiko: "mx",
  Nizozemsko: "nl",
  Německo: "de",
  Norsko: "no",
  Polsko: "pl",
  Portugalsko: "pt",
  Rakousko: "at",
  Rumunsko: "ro",
  Řecko: "gr",
  Slovensko: "sk",
  Srbsko: "rs",
  Španělsko: "es",
  Švédsko: "se",
  Švýcarsko: "ch",
  Turecko: "tr",
  Ukrajina: "ua",
  USA: "us",
  Evropa: "eu",
};

const EN_NAMES: Record<string, string> = {
  Anglie: "England", Skotsko: "Scotland", Wales: "Wales", Belgie: "Belgium", Brazílie: "Brazil", Česko: "Czechia", Chorvatsko: "Croatia",
  Dánsko: "Denmark", Francie: "France", Itálie: "Italy", Maďarsko: "Hungary", Mexiko: "Mexico", Nizozemsko: "Netherlands", Německo: "Germany",
  Norsko: "Norway", Polsko: "Poland", Portugalsko: "Portugal", Rakousko: "Austria", Rumunsko: "Romania", Řecko: "Greece", Slovensko: "Slovakia",
  Srbsko: "Serbia", Španělsko: "Spain", Švédsko: "Sweden", Švýcarsko: "Switzerland", Turecko: "Türkiye", Ukrajina: "Ukraine", USA: "USA", Evropa: "Europe",
};

/** Název země v aktuálním jazyce (data/index.json je má česky). */
export const countryName = (cz: string) => (getLocale() === "en" ? (EN_NAMES[cz] ?? cz) : cz);

export function Flag({ country, width = 18 }: { country?: string | null; width?: number }) {
  const code = country ? CODES[country] : undefined;
  if (!code) return null;
  return (
    <img
      src={`https://flagcdn.com/w40/${code}.png`}
      alt=""
      aria-hidden
      loading="lazy"
      style={{ width, height: Math.round(width * 0.7) }}
      className="shrink-0 rounded-[3px] object-cover shadow-[0_0_0_1px_rgba(128,128,128,0.35)]"
    />
  );
}
