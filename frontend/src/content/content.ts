import { marked } from "marked";
import type { Tier } from "../access/tiers";

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

export const CATEGORIES = ["Jak číst statistiky", "Průvodce webem", "Metodika", "Analýzy"] as const;

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

const newsFiles = import.meta.glob("../../content/news/*.md", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
const articleFiles = import.meta.glob("../../content/articles/*.md", { query: "?raw", import: "default", eager: true }) as Record<string, string>;

export const manualNews: NewsItem[] = Object.entries(newsFiles).map(([path, raw]) => {
  const { meta, body } = parseFrontmatter(raw);
  return { id: slugOf(path), date: meta.date, tag: meta.tag || "Novinka", title: meta.title, text: body, link: meta.link || undefined };
});

export const articles: Article[] = Object.entries(articleFiles)
  .map(([path, raw]) => {
    const { meta, body } = parseFrontmatter(raw);
    const tier = (["anon", "account", "unlimited", "pro"].includes(meta.tier) ? meta.tier : "anon") as Tier;
    return {
      slug: slugOf(path),
      title: meta.title,
      date: meta.date,
      category: meta.category || "Průvodce webem",
      excerpt: meta.excerpt || "",
      minutes: Number(meta.minutes) || Math.max(1, Math.round(body.split(/\s+/).length / 200)),
      tier,
      body,
    };
  })
  .sort((a, b) => b.date.localeCompare(a.date));

export const articleBySlug = (slug: string | undefined) => articles.find((a) => a.slug === slug);

export function renderMarkdown(md: string): string {
  return marked.parse(md, { async: false }) as string;
}

/** Úvod článku pro ty, kdo nemají přístup: první odstavce a nadpisy před `<!-- gate -->` nebo první tři bloky. */
export function articleTeaser(body: string): string {
  const cut = body.indexOf("<!-- gate -->");
  if (cut > -1) return body.slice(0, cut).trim();
  return body.split(/\n{2,}/).slice(0, 3).join("\n\n");
}
