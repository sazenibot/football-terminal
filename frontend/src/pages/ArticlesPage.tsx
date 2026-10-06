import { useMemo, useState, type MouseEvent } from "react";
import { Link, useNavigate, useParams } from "../i18n/router";
import { useAccess } from "../access/AccessContext";
import { Paywall, TierBadge } from "../access/Gate";
import { allows } from "../access/tiers";
import { Back, Frame, NotFound, Pill } from "../cat/kit";
import { articleBySlug, articleTeaser, getArticles, renderMarkdown } from "../content/content";
import { t } from "../i18n/locale";
import { Chip } from "../mc2/kit";
import { fmtDate } from "../site/data";

export function ArticlesPage() {
  const [cat, setCat] = useState<string>("all");
  const articles = useMemo(() => getArticles(), []);
  const categories = useMemo(() => [...new Set(articles.map((a) => a.category))], [articles]);
  const list = useMemo(() => (cat === "all" ? articles : articles.filter((a) => a.category === cat)), [cat, articles]);
  return (
    <Frame wide>
      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-(--c-accent)">{t("articles.eyebrow")}</p>
      <h1 className="mt-1 text-3xl font-bold">{t("articles.title")}</h1>
      <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-(--c-muted)">
        {t("articles.lead")}
      </p>
      <div className="mt-5 flex flex-wrap gap-1.5">
        <Chip active={cat === "all"} onClick={() => setCat("all")}>
          {t("articles.all")}
        </Chip>
        {categories.map((c) => (
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
              {fmtDate(a.date)} · {t("articles.minutesRead", { n: a.minutes })}
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
  const back = <Back to="/clanky">{t("articles.back")}</Back>;
  if (!article) return <NotFound kind={t("articles.notFound")} back={back} />;

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
          {fmtDate(article.date)} · {t("articles.minutesRead", { n: article.minutes })}
        </p>
        <div className="prose-ft relative mt-6" onClick={onClick}>
          <div dangerouslySetInnerHTML={{ __html: html }} />
          {!open && <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-b from-transparent to-(--c-page)" />}
        </div>
        {!open && (
          <div className="mt-2">
            <Paywall need={article.tier} title={t("articles.lockedTitle")} text={t("articles.lockedText")} />
          </div>
        )}
      </article>
    </Frame>
  );
}
