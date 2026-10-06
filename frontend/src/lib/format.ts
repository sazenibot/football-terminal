// Backend teď posílá starting_at jako validní ISO8601 UTC (…Z), takže
import { intlTag } from "../i18n/locale";
// new Date(iso) + toLocaleString bez explicitní timeZone se automaticky
// zobrazí ve správném lokálním čase prohlížeče (Europe/Prague).

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(intlTag(), {
    weekday: "short",
    day: "numeric",
    month: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDateTimeLong(iso: string): string {
  return new Date(iso).toLocaleString(intlTag(), {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(intlTag());
}
