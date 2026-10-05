# MyQuizz — conventies voor (agent)ontwikkelaars

Gratis, volledig client-side quiz-/flashcard-app (React 19 + TypeScript + Vite 8 + Tailwind v4 + Dexie). Gehost op GitHub Pages onder `/MyQuiz/` met HashRouter. Geen backend. UI in NL en EN.

## Commands
- `npm run dev` · `npm run check` (lint + typecheck + unit tests + build) · `npm run e2e` (Playwright, Chromium voorgeïnstalleerd)
- Vóór je klaar bent: `npm run check` moet groen zijn.

## Structuur en eigendom
- `src/domain/` pure logica zonder React (types, grading, srs, cloze, share-codec). **`types.ts` is het contract: niet wijzigen zonder overleg met de orkestrator.** Nieuwe domain-modules mag je toevoegen in je eigen submap (`domain/games/`, `domain/import-export/`, …).
- `src/db/` Dexie-schema + repositories (`repo.ts`). Gebruik de repo-helpers; schema-wijziging = nieuwe `version()` met migratie, alleen door de orkestrator.
- `src/ui/` design system (Button, Card, Input, Toggle, Modal, Badge/Chip/Kbd, ProgressBar/Ring, Tabs, Dropdown, Toast, EmptyState, Tooltip, Markdown). Hergebruik; voeg alleen generieke componenten toe en meld dat.
- `src/app/` shell, router, i18n, theme, settings-store, route-registry (`routes.tsx`). Routes staan al geregistreerd: vervang de placeholder-pagina in jouw `features/<x>/…Page.tsx`.
- `src/features/<x>/` **jouw map**. Werk uitsluitend daarin (+ je locale-bestanden + je tests). Raak andere feature-mappen niet aan.
- `src/locales/{nl,en}/<namespace>.json` één namespace per feature (`editor`, `study`, `games`, `live`, `ai`, `library`). Gebruik `useTranslation('<ns>')`. Beide talen altijd compleet.

## Regels
- Geen commits/pushes door agents; de orkestrator commit per golf.
- Alles moet offline en zonder server werken. Externe calls alleen: Google Fonts, Hugging Face CDN (WebLLM-modellen, lazy, na toestemming), BYOK-API's die de gebruiker zelf instelt, Trystero-signalling voor live.
- Geen `any`; strict TS. Kleine pure functies in `domain/` met Vitest-tests; React-componenten dun.
- Markdown in kaarten renderen via `<Markdown src=…/>` (gesanitized). Nooit `dangerouslySetInnerHTML` met ongesanitizede input.
- Studie-/spelschermen zijn full-screen (`shell: false` in routes): eigen header met modus-switcher links (naam + ▾), titel/teller midden, geluid/instellingen/sluiten (X → `/set/:id`) rechts.
- Styling: Tailwind-classes met de tokens (`bg-primary`, `text-muted`, `bg-surface`, `border-border`, `card`, `bg-gradient-indigo` …). Light én dark moeten goed zijn. Mobiel ≥ 360 px breed.
- Progress en revlog altijd via `recordOutcome()` / `saveProgress()` + `logReview()` in `db/repo.ts`, zodat statistieken en achievements kloppen. Sessies via `startSession()`/`finishSession()`. Spelscores via `recordScore()`.
- i18n-keys in camelCase, teksten natuurlijk Nederlands en Engels.
- Toegankelijkheid: toetsenbordbediening (sneltoetsen uit Quizlet), `aria-label` op icon-knoppen, focus zichtbaar.
