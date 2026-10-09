import { useEffect, type MouseEvent } from "react";
import { useNavigate } from "../i18n/router";
import { Frame, NotFound } from "../cat/kit";
import { getLegal, renderMarkdown } from "../content/content";
import { localizePath, t } from "../i18n/locale";
import { fmtDate } from "../site/data";

/** Právní stránka z markdownu v content/legal/. `slug` je název souboru (česky, v obou jazycích stejný). */
export function LegalPage({ slug }: { slug: "obchodni-podminky" | "ochrana-udaju" }) {
  const page = getLegal(slug);
  const navigate = useNavigate();

  useEffect(() => {
    if (page) document.title = `${page.title} | ${t("nav.brand")}`;
  }, [page]);

  if (!page) return <NotFound kind={t("legal.notFound")} back={null} />;

  // Odkazy uvnitř textu vedou přes router, ať se stránka nenačítá znovu.
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
      <article>
        <h1 className="text-[28px] font-bold leading-tight sm:text-4xl">{page.title}</h1>
        {page.updated && <p className="mt-2 text-[13px] text-(--c-faint)">{t("legal.updated", { date: fmtDate(page.updated) })}</p>}
        <div className="prose-ft mt-6" onClick={onClick}>
          <div dangerouslySetInnerHTML={{ __html: renderMarkdown(page.body).replace(/href="(\/[^"]*)"/g, (_, h: string) => `href="${localizePath(h)}"`) }} />
        </div>
      </article>
    </Frame>
  );
}
