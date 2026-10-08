/** Vývojářské pomůcky (přepínač „Zobrazit jako“, štítek tarifu v záhlaví).
    Ve vývoji vždy; na produkci jen s `VITE_DEV_TOOLS=1`. Před veřejným startem musí být vypnuté
    a tarif se bude brát z přihlášení (body 6–8). */
export const DEV_TOOLS: boolean = import.meta.env.DEV || import.meta.env.VITE_DEV_TOOLS === "1";

/** Tarify a ceník zatím nejsou veřejné (platby nejsou spuštěné). Zapnout lze proměnnou VITE_PRICING=1. */
export const PRICING_OPEN: boolean = import.meta.env.VITE_PRICING === "1";
