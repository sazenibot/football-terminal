/** Vývojářské pomůcky (přepínač „Zobrazit jako“). Ve vývoji vždy; na produkci jen s `VITE_DEV_TOOLS=1`.
    Tarif na produkci bere /api/me. ViewAs nesmí běžet veřejně. */
export const DEV_TOOLS: boolean = import.meta.env.DEV || import.meta.env.VITE_DEV_TOOLS === "1";

/** Ceník je vidět; platby ještě neběží, proto u placených tarifů zůstává „připravujeme“. */
export const PRICING_OPEN = true;
