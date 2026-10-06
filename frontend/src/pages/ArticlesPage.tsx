import { useMemo, useState, type MouseEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAccess } from "../access/AccessContext";
import { Paywall, TierBadge } from "../access/Gate";
import { allows } from "../access/tiers";
import { Back, Frame, NotFound, Pill } from "../cat/kit";
import { CATEGORIES, articleBySlug, articleTeaser, articles, renderMarkdown } from "../content/content";
import { Chip } from "../mc2/kit";
import { fmtDate } from "../site/data";

export function ArticlesPage() {
  const [cat, setCat] = useState<string>("all");
  const list = useMemo(() => (cat === "all" ? articles : articles.filter((a) => a.category === cat)), [cat]);
  return (
    <Frame wide>
      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-(--c-accent)">Servis</p>
      <h1 className="mt-1 text-3xl font-bold">Články a návody</h1>
      <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-(--c-muted)">
        Jak číst jednotlivé statistiky, jak se vyznat na webu a jak model funguje. Ať víte, co čísla říkají, a hlavně co ne.
      </p>
      <div className="mt-5 flex flex-wrap gap-1.5">
        <Chip active={cat === "all"} onClick={() => setCat("all")}>
          Vše
        </Chip>
        {CATEGORIES.filter((c) => articles.some((a) => a.category === c)).map((c) => (
          <Chip key={c} active={cat === c} onClick={() => setCat(c)}>
            {c}
          </Chip>
        ))}
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {list.map((a) => (
          <Link key={a.slug} to={`/clanky/${a.slug}`} className="block rounded-2xl border border-(--c-line) bg-(--c-surface) p-5 transition-colors hover:border-(--c-faint)">
            <div className="flex flex-wrap items-center gap-2">
              <Pill>{a.category}</Pill>
              <TierBadge tier={a.tier} />
            </div>
            <h2 className="mt-2 text-[17px] font-semibold leading-snug">{a.title}</h2>
            <p className="mt-1 text-[13px] leading-snug text-(--c-muted)">{a.excerpt}</p>
            <p className="mt-3 text-[12px] text-(--c-faint)">
              {fmtDate(a.date)} · {a.minutes} min čtení
            </p>
          </Link>
        ))}
      </div>
    </Frame>
  );
}

export function ArticlePage() {
  const { slug } = useParams();
  const article = articleBySlug(slug);
  const { tier } = useAccess();
  const navigate = useNavigate();
  const back = <Back to="/clanky">Články</Back>;
  if (!article) return <NotFound kind="Tento článek" back={back} />;

  const open = allows(tier, article.tier);
  const html = renderMarkdown(open ? article.body.replace("<!-- gate -->", "") : articleTeaser(article.body));

  // Odkazy uvnitř článku vedou přes router, ať se stránka nenačítá znovu.
  const onClick = (e: MouseEvent<HTMLDivElement>) => {
    const a = (e.target as HTMLElement).closest("a");
    const href = a?.getAttribute("href");
    if (a && href && href.startsWith("/") && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      navigate(href);
    }
  };

  return (
    <Frame>
      {back}
      <article className="mt-3">
        <div className="flex flex-wrap items-center gap-2">
          <Pill>{article.category}</Pill>
          <TierBadge tier={article.tier} />
        </div>
        <h1 className="mt-2 text-[28px] font-bold leading-tight sm:text-4xl">{article.title}</h1>
        <p className="mt-2 text-[13px] text-(--c-faint)">
          {fmtDate(article.date)} · {article.minutes} min čtení
        </p>
        <div className="prose-ft relative mt-6" onClick={onClick}>
          <div dangerouslySetInnerHTML={{ __html: html }} />
          {!open && <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-b from-transparent to-(--c-page)" />}
        </div>
        {!open && (
          <div className="mt-2">
            <Paywall need={article.tier} title="Zbytek článku je pro registrované" text="Úvod je otevřený. Pokračování odemkne bezplatný účet." />
          </div>
        )}
      </article>
    </Frame>
  );
}
