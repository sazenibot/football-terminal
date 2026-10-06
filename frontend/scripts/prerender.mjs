/* Po buildu vytvoří statické HTML pro veřejné stránky (hlavička, popis, základní obsah),
   aby je vyhledávače a sociální sítě viděly bez spuštění aplikace. Aplikace zůstává SPA,
   React si obsah po načtení převezme.

   Proměnné prostředí:
     SITE_URL        např. https://football-terminal.cz  (canonical, og:url, sitemap.xml)
     SITE_INDEXABLE  "1" povolí indexaci. Bez něj je všude noindex, dokud web není veřejný. */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
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

const dir = join(root, "content", "articles");
const articles = readdirSync(dir)
  .filter((f) => f.endsWith(".md"))
  .map((f) => {
    const { meta, body } = frontmatter(readFileSync(join(dir, f), "utf8"));
    return { slug: f.replace(/\.md$/, ""), ...meta, body };
  })
  .sort((a, b) => String(b.date).localeCompare(String(a.date)));

const pages = [
  {
    path: "/",
    title: "Football Terminal: fotbalová analytika",
    description: "Statistiky, které se v zápasech opakují. Match Center, datový katalog týmů, hráčů a rozhodčích a veřejná kniha predikcí modelu.",
    html: "<h1>Football Terminal</h1><p>Fotbalová analytika. Hledáme statistiky, které se v zápasech opakují, a ukazujeme, kde z nich může plynout výhoda.</p>",
  },
  {
    path: "/clanky",
    title: "Články a návody | Football Terminal",
    description: "Jak číst xG, FDR a statistiky rozhodčích, jak funguje simulace a jak se vyznat na webu.",
    html: `<h1>Články a návody</h1><ul>${articles.map((a) => `<li><a href="/clanky/${a.slug}">${esc(a.title)}</a>: ${esc(a.excerpt || "")}</li>`).join("")}</ul>`,
  },
  {
    path: "/tarify",
    title: "Tarify | Football Terminal",
    description: "Co je zdarma, co po registraci a co v placených tarifech.",
    html: "<h1>Tarify</h1><p>Zdarma, Zdarma s účtem, Unlimited a Pro. Ceny a rozdělení funkcí jsou zatím návrh.</p>",
  },
  {
    path: "/vysledky",
    title: "Výsledky modelu | Football Terminal",
    description: "Veřejná kniha predikcí zamčených před výkopem a zpětný test modelu včetně kalibrace.",
    html: "<h1>Funguje náš model?</h1><p>Živá kniha predikcí zamčených před výkopem a zpětný test na odehraných zápasech.</p>",
  },
  ...articles.map((a) => ({
    path: `/clanky/${a.slug}`,
    title: `${a.title} | Football Terminal`,
    description: a.excerpt || a.title,
    html: `<article><h1>${esc(a.title)}</h1>${marked.parse(a.tier && a.tier !== "anon" ? teaser(a.body) : a.body.replace("<!-- gate -->", ""))}</article>`,
  })),
];

function render(page) {
  const url = SITE ? SITE + page.path : "";
  const head = [
    `<meta name="description" content="${esc(page.description)}" />`,
    `<meta name="robots" content="${INDEXABLE ? "index, follow" : "noindex, nofollow"}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:title" content="${esc(page.title)}" />`,
    `<meta property="og:description" content="${esc(page.description)}" />`,
    url ? `<link rel="canonical" href="${url}" />` : "",
    url ? `<meta property="og:url" content="${url}" />` : "",
  ]
    .filter(Boolean)
    .join("\n    ");
  return template
    .replace(/<title>.*?<\/title>/, `<title>${esc(page.title)}</title>\n    ${head}`)
    .replace('<div id="root"></div>', `<div id="root">${page.html}</div>`);
}

for (const page of pages) {
  const out = page.path === "/" ? join(dist, "index.html") : join(dist, page.path, "index.html");
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, render(page));
}

if (SITE && INDEXABLE) {
  const urls = pages.map((p) => `  <url><loc>${SITE}${p.path}</loc></url>`).join("\n");
  writeFileSync(join(dist, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`);
  writeFileSync(join(dist, "robots.txt"), `User-agent: *\nAllow: /\nSitemap: ${SITE}/sitemap.xml\n`);
} else {
  writeFileSync(join(dist, "robots.txt"), "User-agent: *\nDisallow: /\n");
}

console.log(`prerender: ${pages.length} stránek, ${INDEXABLE ? "indexovatelné" : "noindex (web zatím není veřejný)"}`);
