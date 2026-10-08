import { marked } from "marked";
import type { Tier } from "../access/tiers";
import { getLocale, type Locale } from "../i18n/locale";
import operatorData from "../../content/legal/operator.json";

/* Obsah webu jsou markdown soubory ve frontend/content/. Vzniká se v repu, žádné CMS.
   news/*.md      krátké aktuality (feed na homepage)
   articles/*.md  články a návody
   Hlavička souboru mezi --- řádky: title, date, tag/category, link, excerpt, tier, minutes. */

export type NewsItem = {
  id: string;
  date: string;
  tag: string;
  title: string;
  text: string;
  link?: string;
  auto?: boolean;
  /** Anglická verze automatické aktuality (texty se generují ve skriptu). */
  en?: { tag: string; title: string; text: string };
};

export type Article = {
  slug: string;
  title: string;
  date: string;
  category: string;
  excerpt: string;
  minutes: number;
  /** Minimální tarif pro celý článek. Ostatním se ukáže jen úvod. */
  tier: Tier;
  body: string;
};

export function parseFrontmatter(raw: string): { meta: Record<string, string>; body: string } {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return { meta: {}, body: raw };
  const meta: Record<string, string> = {};
  for (const line of m[1].split(/\r?\n/)) {
    const i = line.indexOf(":");
    if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  }
  return { meta, body: m[2].trim() };
}

const slugOf = (path: string) => path.split("/").pop()!.replace(/\.md$/, "");

type Files = Record<string, string>;
const glob = {
  news: {
    cs: import.meta.glob("../../content/news/*.md", { query: "?raw", import: "default", eager: true }) as Files,
    en: import.meta.glob("../../content/news/en/*.md", { query: "?raw", import: "default", eager: true }) as Files,
  },
  legal: {
    cs: import.meta.glob("../../content/legal/*.md", { query: "?raw", import: "default", eager: true }) as Files,
    en: import.meta.glob("../../content/legal/en/*.md", { query: "?raw", import: "default", eager: true }) as Files,
  },
  articles: {
    cs: import.meta.glob("../../content/articles/*.md", { query: "?raw", import: "default", eager: true }) as Files,
    en: import.meta.glob("../../content/articles/en/*.md", { query: "?raw", import: "default", eager: true }) as Files,
  },
};

/** Slug je název souboru a je stejný v obou jazycích. Chybí-li anglická verze, použije se česká. */
function bySlug(files: { cs: Files; en: Files }, locale: Locale): [string, string][] {
  const cs = new Map(Object.entries(files.cs).map(([p, raw]) => [slugOf(p), raw] as const));
  if (locale === "cs") return [...cs.entries()];
  const en = new Map(Object.entries(files.en).map(([p, raw]) => [slugOf(p), raw] as const));
  return [...cs.keys()].map((slug) => [slug, en.get(slug) ?? cs.get(slug)!]);
}

export const getManualNews = (locale: Locale = getLocale()): NewsItem[] =>
  bySlug(glob.news, locale).map(([id, raw]) => {
    const { meta, body } = parseFrontmatter(raw);
    return { id, date: meta.date, tag: meta.tag || (locale === "en" ? "News" : "Novinka"), title: meta.title, text: body, link: meta.link || undefined };
  });

export const getArticles = (locale: Locale = getLocale()): Article[] =>
  bySlug(glob.articles, locale)
    .map(([slug, raw]) => {
      const { meta, body } = parseFrontmatter(raw);
      const tier = (["anon", "account", "unlimited", "pro"].includes(meta.tier) ? meta.tier : "anon") as Tier;
      return {
        slug,
        title: meta.title,
        date: meta.date,
        category: meta.category || (locale === "en" ? "Site guide" : "Průvodce webem"),
        excerpt: meta.excerpt || "",
        minutes: Number(meta.minutes) || Math.max(1, Math.round(body.split(/\s+/).length / 200)),
        tier,
        body,
      };
    })
    .sort((a, b) => b.date.localeCompare(a.date));

export const articleBySlug = (slug: string | undefined) => getArticles().find((a) => a.slug === slug);

export function renderMarkdown(md: string): string {
  return marked.parse(md, { async: false }) as string;
}

/** Úvod článku pro ty, kdo nemají přístup: první odstavce a nadpisy před `<!-- gate -->` nebo první tři bloky. */
export function articleTeaser(body: string): string {
  const cut = body.indexOf("<!-- gate -->");
  if (cut > -1) return body.slice(0, cut).trim();
  return body.split(/\n{2,}/).slice(0, 3).join("\n\n");
}

/* ---------- právní stránky (obchodní podmínky, ochrana údajů, kontakt) ---------- */

export type LegalPage = { slug: string; title: string; description: string; updated: string; body: string };

/** Údaje o provozovateli jsou v content/legal/operator.json. Prázdná hodnota se zobrazí jako [doplnit]. */
export function fillOperator(md: string, locale: Locale): string {
  const gap = locale === "en" ? "[to be completed]" : "[doplnit]";
  const data = operatorData as Record<string, string>;
  return md.replace(/\{\{(\w+)\}\}/g, (_, k: string) => (data[k] ?? "").trim() || gap);
}

export function getLegal(slug: string | undefined, locale: Locale = getLocale()): LegalPage | undefined {
  const entry = bySlug(glob.legal, locale).find(([s]) => s === slug);
  if (!entry) return undefined;
  const { meta, body } = parseFrontmatter(entry[1]);
  return { slug: entry[0], title: meta.title, description: meta.description || "", updated: meta.updated || "", body: fillOperator(body, locale) };
}
