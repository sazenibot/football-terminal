import { isStale } from "../lib/useData";
import { t } from "../i18n/locale";
import { fmtStamp } from "../lib/format";

export function StaleBanner({
  generatedAt,
  hours = 26,
}: {
  generatedAt?: string;
  hours?: number;
}) {
  if (!generatedAt || !isStale(generatedAt, hours)) return null;
  const when = fmtStamp(generatedAt);
  return (
    <div className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-300 light:text-amber-800 light:bg-amber-50 light:border-amber-300">
      {t("mx.stale.text", { when })}
    </div>
  );
}
