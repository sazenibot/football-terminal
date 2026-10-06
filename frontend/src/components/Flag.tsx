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
