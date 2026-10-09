/* Po buildu vytvoří statické HTML pro veřejné stránky (hlavička, popis, základní obsah),
   aby je vyhledávače a sociální sítě viděly bez spuštění aplikace. Aplikace zůstává SPA,
   React si obsah po načtení převezme.

   Proměnné prostředí:
     SITE_URL        např. https://football-terminal.com  (canonical, og:url, sitemap.xml)
     SITE_INDEXABLE  "1" povolí indexaci. Bez něj je všude noindex, dokud web není veřejný. */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { marked } from "marked";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const SITE = (process.env.SITE_URL || "").replace(/\/$/, "");
const INDEXABLE = process.env.SITE_INDEXABLE === "1";
const template = readFileSync(join(dist, "index.html"), "utf8");

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function frontmatter(raw) {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return { meta: {}, body: raw };
  const meta = {};
  for (const line of m[1].split(/\r?\n/)) {
    const i = line.indexOf(":");
    if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  }
  return { meta, body: m[2].trim() };
}

function teaser(body) {
  const cut = body.indexOf("<!-- gate -->");
  return cut > -1 ? body.slice(0, cut).trim() : body.split(/\n{2,}/).slice(0, 3).join("\n\n");
}

const readArticles = (dir) =>
  existsSync(dir)
    ? readdirSync(dir)
        .filter((f) => f.endsWith(".md"))
        .map((f) => {
          const { meta, body } = frontmatter(readFileSync(join(dir, f), "utf8"));
          return { slug: f.replace(/\.md$/, ""), ...meta, body };
        })
    : [];

// Plánované vydání: článek s budoucím datem se do stránek ani sitemapy nedostane, dokud datum nenastane.
// Koncepty (content/drafts) se sem nikdy nečtou.
const published = (a) => !a.date || new Date(a.date).getTime() <= Date.now();
const csArticles = readArticles(join(root, "content", "articles")).filter(published);
const enBySlug = new Map(readArticles(join(root, "content", "articles", "en")).filter(published).map((a) => [a.slug, a]));
const byDate = (a, b) => String(b.date).localeCompare(String(a.date));
/* Právní stránky: content/legal/*.md (cs) a content/legal/en/*.md. Údaje provozovatele z operator.json, prázdné = „Na vyžádání“. */
const operator = JSON.parse(readFileSync(join(root, "content", "legal", "operator.json"), "utf8"));
const LEGAL = ["obchodni-podminky", "ochrana-udaju"];
function legalFor(loc) {
  const gap = loc === "en" ? "On request" : "Na vyžádání";
  return LEGAL.map((slug) => {
    const file = join(root, "content", "legal", loc === "en" ? "en" : "", `${slug}.md`);
    const { meta, body } = frontmatter(readFileSync(existsSync(file) ? file : join(root, "content", "legal", `${slug}.md`), "utf8"));
    return { slug, ...meta, body: body.replace(/\{\{(\w+)\}\}/g, (_, k) => String(operator[k] ?? "").trim() || gap) };
  });
}
/** Odkazy v textu napsané česky (/tarify) převede na adresu daného jazyka (/pricing, /cs/tarify). */
function localizeLinks(html, loc) {
  return html.replace(/href="\/(clanky|tarify|vysledky|prihlaseni|obchodni-podminky|ochrana-udaju|kontakt)(?=["\/#?])/g, (_, s) => `href="${prefix(loc)}/${seg(loc, s)}`);
}

// Anglická verze, a když chybí, česká (stejně jako v aplikaci).
const articlesFor = (loc) => (loc === "en" ? csArticles.map((a) => enBySlug.get(a.slug) ?? a) : csArticles).slice().sort(byDate);

/* Texty stránek pro prerender. Cesty jsou české (klíč) a anglické podle SEG. */
const SEG = { clanky: "articles", tarify: "pricing", vysledky: "results", "obchodni-podminky": "terms", "ochrana-udaju": "privacy", kontakt: "contact" };
const seg = (loc, cz) => (loc === "en" ? SEG[cz] : cz);
// Angličtina je výchozí (kořen), čeština pod /cs.
const prefix = (loc) => (loc === "cs" ? "/cs" : "");

const COPY = {
  cs: {
    brand: "Football Terminal",
    home: {
      title: "Football Terminal: fotbalová analytika",
      description: "Statistiky, které se v zápasech opakují. Match Center, datový katalog týmů, hráčů a rozhodčích a veřejná kniha predikcí modelu.",
      html: "<h1>Football Terminal</h1><p>Fotbalová analytika. Hledáme statistiky, které se v zápasech opakují, a ukazujeme, kde z nich může plynout výhoda.</p>",
    },
    articles: { title: "Články a návody", description: "Jak číst xG, FDR a statistiky rozhodčích, jak funguje simulace a jak se vyznat na webu." },
    pricing: {
      title: "Tarify",
      description: "Co je zdarma, co po registraci a v placených tarifech.",
      html: "<h1>Tarify</h1><p>Zdarma, Zdarma s účtem, Unlimited a Pro. Ceny a rozdělení funkcí jsou zatím návrh.</p>",
    },
    results: {
      title: "Výsledky modelu",
      description: "Veřejná kniha predikcí zamčených před výkopem a zpětný test modelu včetně kalibrace.",
      html: "<h1>Funguje náš model?</h1><p>Živá kniha predikcí zamčených před výkopem a zpětný test na odehraných zápasech.</p>",
    },
  },
  en: {
    brand: "Football Terminal",
    home: {
      title: "Football Terminal: football analytics",
      description: "Statistics that repeat in matches. Match Center, a data catalog of teams, players and referees, and a public ledger of model predictions.",
      html: "<h1>Football Terminal</h1><p>Football analytics. We look for the statistics that repeat in matches and show where they can give you an edge.</p>",
    },
    articles: { title: "Articles and guides", description: "How to read xG, FDR and referee statistics, how the simulation works and how to find your way around the site." },
    pricing: {
      title: "Pricing",
      description: "What is free, what needs an account and what is in the paid plans.",
      html: "<h1>Pricing</h1><p>Free, Free account, Unlimited and Pro. Prices and the split of features are a draft for now.</p>",
    },
    results: {
      title: "Model results",
      description: "A public ledger of predictions locked before kick-off and a backtest of the model including calibration.",
      html: "<h1>Does our model work?</h1><p>A live ledger of predictions locked before kick-off and a backtest on played matches.</p>",
    },
  },
};

/** Stránky v obou jazycích. `key` spojuje český a anglický protějšek pro hreflang. */
function pagesFor(loc) {
  const c = COPY[loc];
  const P = prefix(loc);
  const arts = articlesFor(loc);
  return [
    { key: "/", path: P || "/", loc, title: c.home.title, description: c.home.description, html: c.home.html },
    {
      key: "/clanky",
      path: `${P}/${seg(loc, "clanky")}`,
      loc,
      title: `${c.articles.title} | ${c.brand}`,
      description: c.articles.description,
      html: `<h1>${esc(c.articles.title)}</h1><ul>${arts.map((a) => `<li><a href="${P}/${seg(loc, "clanky")}/${a.slug}">${esc(a.title)}</a>: ${esc(a.excerpt || "")}</li>`).join("")}</ul>`,
    },
    { key: "/tarify", path: `${P}/${seg(loc, "tarify")}`, loc, title: `${c.pricing.title} | ${c.brand}`, description: c.pricing.description, html: c.pricing.html },
    { key: "/vysledky", path: `${P}/${seg(loc, "vysledky")}`, loc, title: `${c.results.title} | ${c.brand}`, description: c.results.description, html: c.results.html },
    ...legalFor(loc).map((l) => ({
      key: `/${l.slug}`,
      path: `${P}/${seg(loc, l.slug)}`,
      loc,
      title: `${l.title} | ${c.brand}`,
      description: l.description || l.title,
      html: `<article><h1>${esc(l.title)}</h1>${localizeLinks(marked.parse(l.body), loc)}</article>`,
    })),
    ...arts.map((a) => ({
      key: `/clanky/${a.slug}`,
      path: `${P}/${seg(loc, "clanky")}/${a.slug}`,
      loc,
      title: `${a.title} | ${c.brand}`,
      description: a.excerpt || a.title,
      html: `<article><h1>${esc(a.title)}</h1>${marked.parse(a.tier && a.tier !== "anon" ? teaser(a.body) : a.body.replace("<!-- gate -->", ""))}</article>`,
    })),
  ];
}

// Lab (experimenty) do produkce nepatří. Zůstává jen to, co používá veřejná aplikace.
const LAB_KEEP = new Set(["xgot-efficiency.json"]);
const labDir = join(dist, "data", "lab");
if (existsSync(labDir)) {
  for (const f of readdirSync(labDir)) if (!LAB_KEEP.has(f)) rmSync(join(labDir, f), { recursive: true, force: true });
}

const pages = [...pagesFor("en"), ...pagesFor("cs")];
const pathOf = (key, loc) => pages.find((p) => p.key === key && p.loc === loc)?.path;

function render(page) {
  const url = SITE ? SITE + page.path : "";
  const alternates = ["en", "cs"]
    .map((l) => [l, pathOf(page.key, l)])
    .filter(([, p]) => p)
    .map(([l, p]) => (SITE ? `<link rel="alternate" hreflang="${l}" href="${SITE}${p}" />` : ""))
    .filter(Boolean);
  if (SITE && pathOf(page.key, "en")) alternates.push(`<link rel="alternate" hreflang="x-default" href="${SITE}${pathOf(page.key, "en")}" />`);
  const head = [
    `<meta name="description" content="${esc(page.description)}" />`,
    `<meta name="robots" content="${INDEXABLE ? "index, follow" : "noindex, nofollow"}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:title" content="${esc(page.title)}" />`,
    `<meta property="og:description" content="${esc(page.description)}" />`,
    `<meta property="og:locale" content="${page.loc === "en" ? "en_GB" : "cs_CZ"}" />`,
    url ? `<link rel="canonical" href="${url}" />` : "",
    url ? `<meta property="og:url" content="${url}" />` : "",
    ...alternates,
    SITE ? `<link rel="alternate" type="application/rss+xml" title="${esc(COPY[page.loc].brand)}" href="${SITE}${prefix(page.loc)}/rss.xml" />` : "",
  ]
    .filter(Boolean)
    .join("\n    ");
  return template
    .replace('<html lang="en">', `<html lang="${page.loc}">`)
    .replace(/<title>.*?<\/title>/, `<title>${esc(page.title)}</title>\n    ${head}`)
    .replace('<div id="root"></div>', `<div id="root">${page.html}</div>`);
}

for (const page of pages) {
  // /cs/tarify → cs/tarify.html. Hosting (Cloudflare) ho vydá na adrese bez lomítka, shodné s canonical.
  // Varianta pricing/index.html by přesměrovala na /pricing/ a canonical by neseděl.
  const out = page.path === "/" ? join(dist, "index.html") : join(dist, `${page.path.replace(/\/$/, "")}.html`);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, render(page));
}

/* RSS kanál článků (jeden na jazyk): /rss.xml (angličtina) a /cs/rss.xml (čeština). U článků se zámkem jen perex. */
const rfc822 = (d) => new Date(d).toUTCString();
function rssFor(loc) {
  const P = prefix(loc);
  const arts = articlesFor(loc);
  const items = arts
    .map((a) => {
      const url = `${SITE}${P}/${seg(loc, "clanky")}/${a.slug}`;
      return `    <item>\n      <title>${esc(a.title)}</title>\n      <link>${url}</link>\n      <guid isPermaLink="true">${url}</guid>\n      <pubDate>${rfc822(a.date)}</pubDate>\n      <category>${esc(a.category || "")}</category>\n      <description>${esc(a.excerpt || a.title)}</description>\n    </item>`;
    })
    .join("\n");
  const c = COPY[loc];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">\n  <channel>\n    <title>${esc(c.brand)}: ${esc(c.articles.title)}</title>\n    <link>${SITE}${P || "/"}</link>\n    <description>${esc(c.articles.description)}</description>\n    <language>${loc === "cs" ? "cs-cz" : "en-gb"}</language>\n    <lastBuildDate>${rfc822(arts[0]?.date ?? Date.now())}</lastBuildDate>\n    <atom:link href="${SITE}${P}/rss.xml" rel="self" type="application/rss+xml" />\n${items}\n  </channel>\n</rss>\n`;
}
if (SITE) {
  for (const loc of ["en", "cs"]) {
    const out = join(dist, loc === "cs" ? "cs" : "", "rss.xml");
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, rssFor(loc));
  }
}

if (SITE && INDEXABLE) {
  const urls = pages
    .map((p) => {
      const alts = ["en", "cs"]
        .map((l) => [l, pathOf(p.key, l)])
        .filter(([, path]) => path)
        .map(([l, path]) => `<xhtml:link rel="alternate" hreflang="${l}" href="${SITE}${path}"/>`)
        .join("");
      return `  <url><loc>${SITE}${p.path}</loc>${alts}</url>`;
    })
    .join("\n");
  writeFileSync(
    join(dist, "sitemap.xml"),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls}\n</urlset>\n`,
  );
  writeFileSync(join(dist, "robots.txt"), `User-agent: *\nAllow: /\nSitemap: ${SITE}/sitemap.xml\n`);
} else {
  writeFileSync(join(dist, "robots.txt"), "User-agent: *\nDisallow: /\n");
}

console.log(`prerender: ${pages.length} stránek, ${INDEXABLE ? "indexovatelné" : "noindex (web zatím není veřejný)"}`);
