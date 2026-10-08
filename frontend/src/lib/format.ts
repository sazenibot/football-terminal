// Jediné místo pro formátování data a času v celé aplikaci.
// Backend posílá starting_at jako ISO8601 UTC (…Z), takže new Date(iso) bez explicitní timeZone
// zobrazí lokální čas prohlížeče. Všechny stránky mají používat jen tyto funkce.
import { getLocale, intlTag } from "../i18n/locale";

type Input = string | number | Date;
const d = (v: Input) => (v instanceof Date ? v : new Date(v));

/** 8. 10. */
export const fmtDayMonth = (v: Input) => d(v).toLocaleDateString(intlTag(), { day: "numeric", month: "numeric" });

/** 8. 10. 2026 */
export const fmtDate = (v: Input) => d(v).toLocaleDateString(intlTag(), { day: "numeric", month: "numeric", year: "numeric" });

/** čt 8. 10. */
export const fmtWeekdayDate = (v: Input) => d(v).toLocaleDateString(intlTag(), { weekday: "short", day: "numeric", month: "numeric" });

/** 20:45 */
export const fmtTime = (v: Input) => d(v).toLocaleTimeString(intlTag(), { hour: "2-digit", minute: "2-digit" });

/** čt 8. 10. 20:45 */
export const fmtDateTime = (v: Input) => `${fmtWeekdayDate(v)} ${fmtTime(v)}`;

/** 8. 10. 2026 20:45, pro „aktualizováno“ a časy generování dat */
export const fmtStamp = (v: Input) => `${fmtDate(v)} ${fmtTime(v)}`;

/** Záhlaví dne: „čtvrtek 8. 10.“ (anglicky s názvem měsíce). */
export const fmtDayLong = (v: Input) =>
  d(v).toLocaleDateString(intlTag(), { weekday: "long", day: "numeric", month: getLocale() === "en" ? "long" : "numeric" });

// Zpětně kompatibilní názvy.
export const formatDateTime = fmtDateTime;
export const formatDate = fmtDate;
export function formatDateTimeLong(iso: string): string {
  return new Date(iso).toLocaleString(intlTag(), { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
}
