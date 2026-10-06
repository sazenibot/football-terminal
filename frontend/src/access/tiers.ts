/* Tarify a pravidla přístupu na jednom místě.
   Obsah se nezamyká podle "natvrdo" napsaných tarifů v komponentách, ale přes klíč funkce:
   <Gate feature="catalog.players">. Změna toho, co patří do kterého tarifu, je úprava jednoho řádku v FEATURES.
   Ceny a texty tarifů jsou zatím mockup k diskusi. */

export type Tier = "anon" | "account" | "unlimited" | "pro";

export const TIER_ORDER: Tier[] = ["anon", "account", "unlimited", "pro"];
export const tierRank = (t: Tier) => TIER_ORDER.indexOf(t);

export type TierInfo = {
  id: Tier;
  name: string;
  price: string;
  period: string;
  tagline: string;
  /** Zatím nerozhodnuté, ukázkové údaje. */
  mock?: boolean;
  featured?: boolean;
};

export const TIERS: TierInfo[] = [
  { id: "anon", name: "Zdarma", price: "0 Kč", period: "bez registrace", tagline: "Podívejte se, co umíme, bez závazků." },
  { id: "account", name: "Zdarma s účtem", price: "0 Kč", period: "po registraci", tagline: "Registrace odemkne další část dat a jeden budoucí zápas." },
  { id: "unlimited", name: "Unlimited", price: "249 Kč", period: "měsíčně", tagline: "Všechna data a celý Match Center bez omezení.", featured: true },
  { id: "pro", name: "Pro", price: "499 Kč", period: "měsíčně, ilustrativní cena", tagline: "Všechno z Unlimited a nástroje pro hledání hodnoty.", mock: true },
];

export const tierName = (t: Tier) => TIERS.find((x) => x.id === t)?.name ?? t;

export type FeatureGroup = "Match Center" | "Datový katalog" | "Obsah" | "Nástroje";

export type FeatureDef = { label: string; group: FeatureGroup; min: Tier; note?: string };

export const FEATURES = {
  "mc.past": { label: "Odehrané zápasy od včerejška do minulosti", group: "Match Center", min: "anon" },
  "mc.future.one": { label: "Jeden budoucí zápas s plným rozborem", group: "Match Center", min: "account", note: "První, který otevřete. Další se zamknou." },
  "mc.future.all": { label: "Všechny budoucí zápasy, rozbor, simulace, kurzy", group: "Match Center", min: "unlimited" },
  "catalog.teams.basic": { label: "Týmy: první dvě části každého profilu", group: "Datový katalog", min: "anon" },
  "catalog.teams": { label: "Týmy: celý profil včetně radaru a trenérů", group: "Datový katalog", min: "account" },
  "catalog.players.basic": { label: "Hráči: první dvě části každého profilu", group: "Datový katalog", min: "anon" },
  "catalog.players": { label: "Hráči: celý profil, mapa střel a srovnání", group: "Datový katalog", min: "unlimited" },
  "catalog.referees.basic": { label: "Rozhodčí: přehled", group: "Datový katalog", min: "anon" },
  "catalog.referees": { label: "Rozhodčí: zápasy, srovnání týmů a celé statistiky", group: "Datový katalog", min: "unlimited" },
  "articles.free": { label: "Základní průvodci a vysvětlení metrik", group: "Obsah", min: "anon" },
  "articles.premium": { label: "Hloubkové články a analýzy", group: "Obsah", min: "account" },
  "results.live": { label: "Výsledky: živá kniha predikcí", group: "Obsah", min: "anon" },
  "results.detail": { label: "Výsledky: rozpis všech zápasů a kalibrace", group: "Obsah", min: "account" },
  "value.finder": { label: "Value finder: zápasy s největším rozdílem modelu a kurzu", group: "Nástroje", min: "pro" },
  "system.picks": { label: "System picks: automatické hledání hodnoty", group: "Nástroje", min: "pro" },
} as const satisfies Record<string, FeatureDef>;

export type Feature = keyof typeof FEATURES;

export const GROUPS: FeatureGroup[] = ["Match Center", "Datový katalog", "Obsah", "Nástroje"];

export const featureMin = (f: Feature): Tier => FEATURES[f].min;
export const allows = (tier: Tier, need: Tier) => tierRank(tier) >= tierRank(need);
