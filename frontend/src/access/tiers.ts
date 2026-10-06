/* Tarify a pravidla přístupu na jednom místě.
   Obsah se nezamyká podle "natvrdo" napsaných tarifů v komponentách, ale přes klíč funkce:
   <Gate feature="catalog.players">. Změna toho, co patří do kterého tarifu, je úprava jednoho řádku v FEATURES.
   Ceny a texty tarifů jsou zatím mockup k diskusi. */

import { t, type Key } from "../i18n/locale";

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

const TIER_META: Record<Tier, { mock?: boolean; featured?: boolean }> = {
  anon: {},
  account: {},
  unlimited: { featured: true },
  pro: { mock: true },
};

/** Texty tarifů se berou z překladů, takže seznam se skládá až při vykreslení (v aktuálním jazyce). */
export const getTiers = (): TierInfo[] =>
  TIER_ORDER.map((id) => ({
    id,
    name: t(`tier.${id}.name` as Key),
    price: t(`tier.${id}.price` as Key),
    period: t(`tier.${id}.period` as Key),
    tagline: t(`tier.${id}.tagline` as Key),
    ...TIER_META[id],
  }));

export const tierName = (id: Tier) => t(`tier.${id}.name` as Key);

export type FeatureGroup = "mc" | "catalog" | "content" | "tools";

export type FeatureDef = { group: FeatureGroup; min: Tier; note?: boolean };

/** Popisek funkce je v překladech pod klíčem feat.<id>, poznámka pod feat.<id>.note. */
export const FEATURES = {
  "mc.past": { group: "mc", min: "anon" },
  "mc.future.one": { group: "mc", min: "account", note: true },
  "mc.future.all": { group: "mc", min: "unlimited" },
  "catalog.teams.basic": { group: "catalog", min: "anon" },
  "catalog.teams": { group: "catalog", min: "account" },
  "catalog.players.basic": { group: "catalog", min: "anon" },
  "catalog.players": { group: "catalog", min: "unlimited" },
  "catalog.referees.basic": { group: "catalog", min: "anon" },
  "catalog.referees": { group: "catalog", min: "unlimited" },
  "articles.free": { group: "content", min: "anon" },
  "articles.premium": { group: "content", min: "account" },
  "results.live": { group: "content", min: "anon" },
  "results.detail": { group: "content", min: "account" },
  "value.finder": { group: "tools", min: "pro" },
  "system.picks": { group: "tools", min: "pro" },
} as const satisfies Record<string, FeatureDef>;

export type Feature = keyof typeof FEATURES;

export const GROUPS: FeatureGroup[] = ["mc", "catalog", "content", "tools"];
export const groupLabel = (g: FeatureGroup) => t(`group.${g}` as Key);
export const featureLabel = (f: Feature) => t(`feat.${f}` as Key);
export const featureNote = (f: Feature) => ((FEATURES[f] as FeatureDef).note ? t(`feat.${f}.note` as Key) : undefined);

export const featureMin = (f: Feature): Tier => FEATURES[f].min;
export const allows = (tier: Tier, need: Tier) => tierRank(tier) >= tierRank(need);
