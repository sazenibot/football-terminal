import { isStale } from "../lib/useData";

export function StaleBanner({
  generatedAt,
  hours = 26,
}: {
  generatedAt?: string;
  hours?: number;
}) {
  if (!generatedAt || !isStale(generatedAt, hours)) return null;
  const when = new Date(generatedAt).toLocaleString("cs-CZ");
  return (
    <div className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-300 light:text-amber-800 light:bg-amber-50 light:border-amber-300">
      Data jsou starší než denní interval (poslední aktualizace {when}). Dnešní běh ještě nedorazil.
    </div>
  );
}
