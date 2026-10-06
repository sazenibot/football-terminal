---
title: Jak funguje simulace zápasu
date: 2026-10-06
category: Metodika
excerpt: Z čeho model vychází, co do něj nevstupuje a jak poznáte, jestli mu věřit.
minutes: 5
tier: account
---
Simulace v Match Center odpovídá na otázku: **kolik gólů by měl každý tým dát a s jakou pravděpodobností skončí zápas výhrou domácích, remízou, nebo výhrou hostů.**

## Základ: očekávané góly

Pro oba týmy odhadneme, kolik gólů v zápase dá. Vychází se z útočné síly týmu, obranné síly soupeře a ze střelby doma nebo venku. Na začátku sezóny se čerpá hlavně z loňských dat, s postupem sezóny přebírají váhu letošní zápasy.

<!-- gate -->

## Úpravy

- **Soupeř:** týmy se hodnotí podle toho, proti komu skórovaly, ne jen kolik gólů dali.
- **Kvalita šancí:** do odhadu vstupuje xG za posledních šest zápasů, ať jedna náhodná výhra nezkreslí obraz.
- **Odpočinek:** tým po pauze do tří dnů má mírně nižší útok a slabší obranu.
- **Nováčci:** dostanou průměr tří nejslabších týmů minulé sezóny, dokud nemají vlastní data.

## Z gólů na pravděpodobnosti

Očekávané góly se převedou na rozdělení výsledků (Poissonovo rozdělení, v modelu je připravená i korekce nízkých skóre, ale testy ji nepotvrdily, proto je vypnutá). Z něj se spočítají výhra, remíza, prohra, over a under, nejčastější skóre a další trhy.

## Co do modelu nevstupuje

- **Kurz.** Model je nezávislý na sázkových kancelářích. Kurz se zobrazuje vedle něj, aby šlo oba pohledy porovnat.
- **Zranění a sestavy** v nich nejsou promítnuté. Berte je jako dodatečný kontext.

## Jak poznat, jestli mu věřit

Model se musí testovat na zápasech, které neviděl. Na stránce Výsledky jsou dva testy: zpětný, kde se každý zápas předpovídá jen z dat před ním, a živá kniha predikcí zamčených před výkopem. Důležité nejsou jen trefená vítězství, ale i **kalibrace**: když model říká 60 %, má to vycházet zhruba na 60 %.
