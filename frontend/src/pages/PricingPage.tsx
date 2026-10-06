import { Link } from "react-router-dom";
import { useAccess } from "../access/AccessContext";
import { FEATURES, GROUPS, TIERS, TIER_ORDER, allows, tierName, type Feature } from "../access/tiers";
import { Frame } from "../cat/kit";
import { Disclosure } from "../mc2/kit";

const HIGHLIGHTS: Record<string, string[]> = {
  anon: ["Odehrané zápasy v Match Center", "První dvě části profilů v katalogu", "Základní články a vysvětlení metrik", "Živá kniha predikcí"],
  account: ["Vše ze „Zdarma“", "Jeden budoucí zápas s plným rozborem", "Celý profil týmů", "Rozpis zápasů modelu a kalibrace", "Hloubkové články"],
  unlimited: ["Vše ze „Zdarma s účtem“", "Všechny budoucí zápasy: rozbor, simulace, kurzy", "Celý profil hráčů a rozhodčích", "Mapa střel a srovnání hráčů"],
  pro: ["Vše z Unlimited", "Value finder", "System picks", "Připravujeme, rozsah ještě upřesníme"],
};

const FAQ: [string, string][] = [
  ["Platí tarify už teď?", "Ne. Web zatím není veřejný, ceny i rozdělení funkcí jsou návrh k diskusi. Platby ani registrace zatím nejsou spuštěné."],
  ["Co znamená jeden budoucí zápas s účtem zdarma?", "Účet zdarma si otevře jeden budoucí zápas a ten zůstane jeho. Další budoucí zápasy odemkne Unlimited. Odehrané zápasy jsou otevřené všem."],
  ["Je model zárukou výhry?", "Není. Modelové pravděpodobnosti jsou odhad a minulé výsledky nezaručují budoucí. Čísla, jak se nám daří, zveřejňujeme na stránce Výsledky, včetně těch horších."],
  ["Dá se tarif zrušit?", "U placených tarifů počítáme s měsíčním předplatným bez závazku. Přesné podmínky doplníme před spuštěním plateb."],
  ["Pro koho je služba?", "Pro dospělé, kteří mají rádi data o fotbale. Služba je určena osobám starším 18 let a nejde o doporučení k sázce."],
];

export function PricingPage() {
  const { tier } = useAccess();
  return (
    <Frame wide>
      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-(--c-accent)">Tarify</p>
      <h1 className="mt-1 text-3xl font-bold">Co v kterém tarifu najdete</h1>
      <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-(--c-muted)">
        Čtyři úrovně, od otevřeného webu po nástroje na hledání hodnoty. Co patří do kterého tarifu, je níže rozepsané funkci po funkci.
      </p>
      <p role="note" className="mt-4 rounded-xl border border-(--c-warn)/40 bg-(--c-warn)/10 px-4 py-2.5 text-[13px] text-(--c-text)">
        <b>Návrh.</b> Ceny a rozdělení funkcí jsou zatím ilustrativní a budeme je ještě ladit. Platby nejsou spuštěné.
      </p>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {TIERS.map((t) => (
          <article key={t.id} className={`flex flex-col rounded-2xl border bg-(--c-surface) p-5 ${t.featured ? "border-(--c-accent)" : "border-(--c-line)"}`}>
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-(--c-accent)">{t.name}</p>
              {t.featured && <span className="rounded-full bg-(--c-accent)/15 px-2 py-0.5 text-[10px] font-semibold text-(--c-accent)">Doporučený</span>}
            </div>
            <p className="mt-2 text-3xl font-bold">{t.price}</p>
            <p className="text-[12px] text-(--c-faint)">{t.period}</p>
            <p className="mt-3 text-[13px] leading-snug text-(--c-muted)">{t.tagline}</p>
            <ul className="mt-3 flex-1 space-y-1.5 text-[13px]">
              {HIGHLIGHTS[t.id].map((p) => (
                <li key={p} className="flex gap-2">
                  <span className="text-(--c-accent)">✓</span>
                  <span>{p}</span>
                </li>
              ))}
            </ul>
            <div className="mt-4">
              {tier === t.id ? (
                <span className="inline-flex min-h-9 items-center rounded-xl border border-(--c-accent) px-4 text-[13px] font-medium text-(--c-accent)">Právě zobrazujete</span>
              ) : t.id === "anon" ? (
                <span className="text-[12px] text-(--c-faint)">Bez registrace</span>
              ) : t.id === "account" ? (
                <Link to="/prihlaseni" className="inline-flex min-h-9 items-center rounded-xl btn-accent px-4 text-[13px] font-semibold hover:opacity-90">
                  Zaregistrovat zdarma
                </Link>
              ) : (
                <span className="inline-flex min-h-9 items-center rounded-xl border border-dashed border-(--c-line) px-4 text-[13px] text-(--c-muted)">Platby připravujeme</span>
              )}
            </div>
          </article>
        ))}
      </div>

      <h2 className="mt-10 text-xl font-semibold">Srovnání funkcí</h2>
      <div className="mt-3 overflow-x-auto rounded-2xl border border-(--c-line) bg-(--c-surface)">
        <table className="w-full min-w-[640px] text-[13px]">
          <thead>
            <tr className="border-b border-(--c-line) text-left">
              <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-(--c-faint)">Funkce</th>
              {TIER_ORDER.map((t) => (
                <th key={t} className="px-3 py-3 text-center text-[11px] font-semibold uppercase tracking-wider text-(--c-faint)">
                  {tierName(t)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {GROUPS.map((g) => (
              <GroupRows key={g} group={g} />
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="mt-10 text-xl font-semibold">Časté otázky</h2>
      <div className="mt-3 space-y-2">
        {FAQ.map(([q, a]) => (
          <Disclosure key={q} summary={q}>
            <p className="text-[13px] leading-relaxed text-(--c-muted)">{a}</p>
          </Disclosure>
        ))}
      </div>
    </Frame>
  );
}

function GroupRows({ group }: { group: string }) {
  const rows = (Object.keys(FEATURES) as Feature[]).filter((k) => FEATURES[k].group === group);
  return (
    <>
      <tr className="bg-(--c-raised)/50">
        <td colSpan={5} className="px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-(--c-faint)">
          {group}
        </td>
      </tr>
      {rows.map((k) => {
        const f = FEATURES[k] as { label: string; min: (typeof TIER_ORDER)[number]; note?: string };
        return (
          <tr key={k} className="border-t border-(--c-line)">
            <td className="px-4 py-2.5">
              {f.label}
              {f.note && <span className="block text-[11px] text-(--c-faint)">{f.note}</span>}
            </td>
            {TIER_ORDER.map((t) => (
              <td key={t} className="px-3 py-2.5 text-center">
                {allows(t, f.min) ? <span className="text-(--c-accent)">✓</span> : <span className="text-(--c-faint)">–</span>}
              </td>
            ))}
          </tr>
        );
      })}
    </>
  );
}
