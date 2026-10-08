import type { AiAnalysis } from "../types";
import { Section } from "./ui";
import { getLocale, t } from "../i18n/locale";

/** Text analýzy v aktuálním jazyce. V angličtině bez text_en nic (česká věta by na EN webu rušila). */
export const aiText = (a?: AiAnalysis | null) => (getLocale() === "en" ? a?.text_en : a?.text);

export function AiAnalysisSection({ analysis }: { analysis?: AiAnalysis | null }) {
  return (
    <Section
      title={t("mx.ai.title")}
      subtitle={analysis?.model ? analysis.model : undefined}
      note={t("mx.ai.note")}
    >
      {!aiText(analysis) ? (
        <p className="text-slate-400 light:text-slate-500 text-sm">{t("mx.ai.empty")}</p>
      ) : (
        <div className="text-sm leading-relaxed text-slate-300 light:text-slate-700 whitespace-pre-wrap">
          {aiText(analysis)}
        </div>
      )}
    </Section>
  );
}
