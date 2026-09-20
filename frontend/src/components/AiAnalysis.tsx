import type { AiAnalysis } from "../types";
import { Section } from "./ui";

export function AiAnalysisSection({ analysis }: { analysis?: AiAnalysis | null }) {
  return (
    <Section
      title="10. AI analýza"
      subtitle={analysis?.model ? analysis.model : undefined}
      note="Text generovaný modelem z našich stažených dat (forma, H2H, simulace, kurzy). Není to sázková rada."
    >
      {!analysis?.text ? (
        <p className="text-slate-500 light:text-slate-400 text-sm">
          Analýza se doplní při denním ingestu. Prohlížeč OpenAI nevolá.
        </p>
      ) : (
        <div className="text-sm leading-relaxed text-slate-300 light:text-slate-700 whitespace-pre-wrap">
          {analysis.text}
        </div>
      )}
    </Section>
  );
}
