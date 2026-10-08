# Jak psát a vydávat články a aktuality

Obsah webu jsou markdown soubory v této složce. Žádné CMS ani databáze. Co je v gitu na `main`, to je na webu po dalším nasazení (Cloudflare Pages staví při každém pushi, tedy nejpozději s denním refreshem dat).

## Složky

| Složka | Co to je |
| --- | --- |
| `articles/` | články a návody (česky), `articles/en/` anglická verze |
| `news/` | krátké aktuality na homepage (česky), `news/en/` anglicky |
| `legal/` | obchodní podmínky, ochrana údajů, kontakt, `legal/operator.json` s údaji provozovatele |
| `drafts/` | **koncepty**, stejná struktura jako výše (`drafts/articles/`, `drafts/articles/en/`, `drafts/news/`, `drafts/news/en/`) |

Název souboru (bez `.md`) je adresa a je stejný v češtině i angličtině. `articles/jak-cist-xg.md` je `/cs/clanky/jak-cist-xg` a anglicky `/articles/jak-cist-xg`. Chybí-li anglický soubor, zobrazí se česká verze.

## Šablona článku

```markdown
---
title: Jak číst xG
date: 2026-10-15
category: Průvodce webem
excerpt: Jedna až dvě věty do výpisu a do popisku ve vyhledávači (cca do 160 znaků).
minutes: 4
tier: anon
---
Úvodní odstavec. Zhruba první tři bloky uvidí i ten, kdo nemá přístup k celému článku.

## Mezititulek

Text. Odkazy na web píšeme česky bez jazykové předpony: [Výsledky](/vysledky), [zápas](/match/123).
```

- `tier`: `anon` (všichni), `account` (po registraci), `unlimited`, `pro`. Zbytek článku se pak nahradí výzvou. Značka `<!-- gate -->` určí, kde přesně se text uřízne.
- `date`: datum vydání, `2026-10-15` nebo i s časem `2026-10-15T08:00:00Z`.

## Šablona aktuality

```markdown
---
title: Spouštíme knihu predikcí
date: 2026-10-06T17:00:00Z
tag: Model
link: /vysledky
---
Dvě až tři věty. Odkaz `link` je volitelný.
```

## Koncepty a plánované vydání

- **Koncept:** soubor ve `drafts/` (např. `drafts/articles/muj-clanek.md`). Vidíte ho při `npm run dev` a na produkci není ani v kódu. Když je hotový, přesuňte ho do `articles/` (`git mv`).
- **Plánované vydání:** soubor v `articles/` nebo `news/` s `date` v budoucnosti se na webu (seznamy, homepage, sitemap) objeví, až datum nastane. Pozor: text v tom případě už je v kódu stránky, jen se nezobrazuje. Chcete-li, aby nebyl vidět nikomu, nechte ho do dne vydání ve `drafts/` a v den vydání ho přesuňte.
- **Kontrola před vydáním:** pošlete změnu do větve (ne do `main`). Cloudflare Pages vytvoří náhledovou adresu a články si prohlédnete na ostré verzi webu.

## Postup (doporučený)

1. Vymyslíte téma. V Cursoru nechte vytvořit návrh česky a anglicky do `drafts/`.
2. Zkontrolujete text ve vývojovém režimu (`npm run dev`, adresa `/clanky`).
3. Přesunete do `articles/` a `articles/en/` (a případně přidáte aktualitu do `news/`).
4. Push do `main`. Hotovo.

## Pravidla textu

- Piště česky bez zbytečných anglicismů, krátké věty, mezititulky `##`.
- Čísla z modelu vždy s kontextem (velikost vzorku, období). Nic neslibujeme, nejde o sázkové doporučení.
- Obrázky zatím nepoužíváme. Až přibudou, patří do `frontend/public/content/` a odkazují se jako `/content/nazev.png`.

## RSS

Při buildu se z publikovaných článků vytváří RSS kanály `/rss.xml` (angličtina) a `/cs/rss.xml` (čeština). Odkaz na ně je v `<head>` každé stránky. U článků se zámkem jde do kanálu jen perex (`excerpt`). Nic dalšího není potřeba dělat.
