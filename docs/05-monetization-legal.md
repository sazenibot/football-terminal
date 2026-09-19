# Monetizace a legislativa — Football Terminal

> Status: 🔴 nezahájeno.

## Monetizační model

✅ **Rozhodnuto (kolo 2):** vícetierové předplatné (např. Free / Pro /
Premium) s různým rozsahem dat a metrik. Toto je pro **fázi 2** — MVP
(fáze 1) běží bez registrace/paywallu.

❓ OPEN QUESTION — konkrétní obsah tierů, až budeme blíž fázi 2:
- Free: co přesně (základní tabulky/rozpisy, omezená hloubka statistik)?
- Pro / Premium: co je za paywallem (hero metrika formy/trendu?
  historická data? víc lig? žádné reklamy?)
- Cena za tier (orientační benchmark: konkurenční stat/betting-analytics
  weby se pohybují řádově v jednotkách € až ~20 €/měsíc za top tier).

## Platby

❓ OPEN QUESTION — platební brána (Stripe je pravděpodobná volba pro
subscription model), fakturace, DPH pro EU/ČR.

## Legislativa a compliance

- **GDPR** — správa uživatelských dat, souhlasy, právo na výmaz.
- **Licence dat** — ověřit, že vybraný API provider (viz `03`) dovoluje
  komerční use-case a zobrazování dat za paywallem koncovým uživatelům.
- **Obchodní podmínky / Zásady ochrany osobních údajů** — potřeba právní
  revize před spuštěním placeného provozu.
- ❓ OPEN QUESTION — právní forma provozovatele (OSVČ/s.r.o.)? Ovlivňuje
  fakturaci a smlouvy s API providery.

## ⚠️ Regulace hazardu / reklamy na hazard (nové, dopad z kola 1)

Cílová skupina "sázkaři" posouvá projekt blíž k regulaci hazardu, i když
web samotný nesázky nezprostředkovává. Klíčové rozlišení, které musíme
udělat brzy:

1. **"Analytický/statistický web s daty relevantními pro sázkaře"** —
   nižší regulatorní zátěž, blíž k běžnému stat webu (FotMob-style), i
   když zobrazujeme kurzy jako informaci.
2. **"Tipařský/predikční web" (doporučuje konkrétní sázky, "value bets",
   affiliate linky na sázkové kanceláře)** — vyšší regulatorní zátěž:
   - Věková verifikace (18+)
   - Povinné disclaimery ("hraj odpovědně", odkaz na pomoc při
     gamblingové závislosti)
   - V ČR podléhá reklama na hazardní hry zákonu č. 186/2016 Sb. (zákon o
     hazardních hrách) — pokud bychom měli affiliate/reklamní vazbu na
     sázkové kanceláře, je nutná právní konzultace.
   - Platební providery (Stripe apod.) mohou mít vlastní omezení pro
     "gambling-adjacent" produkty.

❓ OPEN QUESTION — do které kategorie chceme spadat? Doporučení (tech
lead/PM pohled): pro MVP zůstat u varianty 1 (čistě analytika, žádné
affiliate odkazy na sázkové kanceláře, žádné "doporučujeme vsadit na..."
formulace) — zásadně snižuje legislativní riziko a zrychluje launch.
Monetizace pak stojí čistě na subscription za přístup k datům/analýze, ne
na provizích ze sázek.
