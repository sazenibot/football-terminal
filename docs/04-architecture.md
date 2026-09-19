# Architektura a tech stack — Football Terminal

> Status: 🔴 nezahájeno. Návrh přijde po ujasnění rozsahu (`01`) a dat
> (`03`), aby volba stacku odpovídala reálným požadavkům (např. potřeba
> live dat ovlivní volbu mezi REST/GraphQL/WebSockets).

## Předpoklady, ze kterých vycházíme

- Backend musí být **API-first** (kvůli budoucí mobilní appce) —
  frontend web i budoucí mobilní klient konzumují stejné API.
- Napojení na externí fotbalové API (viz `03-data-and-api.md`).
- Registrace, autentizace, paywall/platby (fáze 2).
- ✅ **Kolo 2:** implementace primárně přes AI agenta (Cursor) s tebou v
  roli PM/review, bez dedikovaného DevOps/backend specialisty. → preferuj
  konvenční, dobře zdokumentované, **managed** služby (méně vlastní infra
  k údržbě), mainstreamové frameworky s velkou komunitou/dokumentací
  (snazší pro AI agenta generovat správný, udržitelný kód), a
  jednoduchou deployment story (např. jeden managed hosting pro
  backend+DB, jeden pro frontend), aby se minimalizovala provozní zátěž.

## Otevřené otázky k tech stacku

❓ OPEN QUESTION — preferovaný jazyk/ekosystém backendu? (Node.js/TypeScript,
Python, Go, ...) — záleží i na tom, co znáš/preferuješ pro budoucí údržbu.

❓ OPEN QUESTION — frontend framework (React/Next.js, Vue/Nuxt, ...)?

❓ OPEN QUESTION — databáze (PostgreSQL pravděpodobně pro relační data +
případně Redis pro cache/live data)?

❓ OPEN QUESTION — hosting/infra (Vercel/Netlify pro frontend, Railway/
Fly.io/AWS/GCP pro backend, managed DB, ...)? Rozpočet?

❓ OPEN QUESTION — mobilní appka: nativní (Swift/Kotlin), cross-platform
(React Native/Flutter), nebo PWA jako mezikrok?

## Diagram (k doplnění)

Zatím prázdné — doplníme po ujasnění výše.
