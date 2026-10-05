# MyQuizz

**Gratis quiz- en flashcard-app die volledig in je browser draait.** Geen account, geen server, geen kosten: alles staat lokaal op je apparaat, je kunt alles exporteren, importeren en delen met collega's, en de app is installeerbaar als PWA en werkt offline.

🌐 **Live:** https://pimo131.github.io/MyQuiz/ · 🇬🇧 [English below](#english)

## Wat kan MyQuizz?

**Sets maken en bewerken**
- Term/definitie-kaarten met afbeeldingen, hints, geheugensteuntjes, voorbeelden, alternatieve antwoorden en eigen meerkeuze-afleiders
- Taal per zijde met speciale-tekensbalk, opmaak (vet, cursief, onderstrepen, markeren), spraakinvoer
- Cloze-kaarten (`{{c1::antwoord::hint}}`) en image occlusion
- Slepen om te sorteren, zoeken in kaarten, sneltoetsen, autosave

**Importeren en exporteren**
- Plakken uit Word/Excel/Google Docs met zelfgekozen scheidingstekens en live preview
- Bestanden: CSV/TSV, Anki (`.txt` en `.apkg`), Quizlet-export, Markdown, MyQuizz JSON
- Exporteren naar JSON, CSV, TSV, Anki, Quizlet-tekst, Markdown; afdrukken als indexkaarten of lijst
- Volledige backup als ZIP (met media) en terugzetten (samenvoegen of vervangen), optioneel versleuteld met wachtwoord

**Delen met collega's (zonder server)**
- Deel-link (set zit gecomprimeerd in de link), QR-code, bestand, Web Share, e-mail, embed-code
- Toevoegen aan agenda (Google, Outlook, .ics)

**Studeren**
- Flashcards (bladeren of sorteren op "ken ik / nog leren")
- Spaced repetition met FSRS (Opnieuw / Moeilijk / Oké / Makkelijk, dagplan, leech-detectie, instelbare retentie)
- Leren (adaptief, meerkeuze en typen, drie nakijkniveaus, uitleg bij fouten)
- Schrijven (met antwoord-diff en "ik had het goed"), Spellen (voorlezen en typen)
- Toets (waar/niet waar, meerkeuze, matching, open, ordenen, meerdere antwoorden, invullen) met herkansingsronde

**Spellen**
- Match, Blocks, Blast, Charms, Galgje, Woordzoeker, Speed Review

**Samen spelen (peer-to-peer, geen server)**
- Gastheer maakt een kamer met code en QR; spelers doen mee via link of code
- Classic Live (race), Multiplayer Match, Blast live, Studeer met vrienden (vaakst gemiste termen)
- Teams, mascottes, snelheids- en reekspunten, power-ups

**AI, gratis en zonder key**
- Basislogica werkt altijd: kaarten uit tekst halen, afleiders, slim nakijken, uitleg
- Lokaal taalmodel in de browser (WebLLM, WebGPU) na eenmalige download, Chrome ingebouwde AI als die aanwezig is
- Eigen API-key (Gemini, Groq, OpenRouter, OpenAI, Anthropic) als upgrade; blijft in je browser
- Kaarten genereren uit tekst of PDF, studiegids, oefentoets, AI-tutor ("probeer me te verrassen"), luistermodus (set als "podcast" voorgelezen)

**Kaarten maken met je eigen AI (zonder key)**

Heb je al een abonnement op ChatGPT, Claude, Gemini of Copilot? Laat die chatbot dan de kaarten schrijven; MyQuizz importeert het antwoord. Open in de app **AI → Importeren via je eigen AI** (`#/import/ai`):

1. Kies je AI en verzamel je bronnen (pdf, screenshots, link, aantekeningen).
2. Klik **Prompt kopiëren** (of download de `.md`). De prompt beschrijft precies het MyQuizz-formaat, inclusief hints, ezelsbruggetjes, alternatieve antwoorden, meerkeuze-afleiders en cloze.
3. Upload je bronnen in de chatbot, plak de prompt eronder en verstuur.
4. Plak het antwoord (het hele ```json-blok mag, tab-gescheiden regels ook) terug in MyQuizz, bekijk het voorbeeld en importeer.

De promptbestanden staan in [`public/ai/myquizz-import-skill.md`](public/ai/myquizz-import-skill.md) (Engels) en [`public/ai/myquizz-import-skill.nl.md`](public/ai/myquizz-import-skill.nl.md) (Nederlands); [`skills/myquizz-import/SKILL.md`](skills/myquizz-import/SKILL.md) is dezelfde instructie als installeerbare skill voor agents.

**Overig**
- Bibliotheek met mappen, zoeken, prestaties met badges en streak-kalender, statistieken met heatmap, meldingen
- Nederlands en Engels, licht en donker thema, toetsenbordbediening, installeerbaar, offline

## Privacy

Alles blijft op je apparaat (IndexedDB). Er is geen server van MyQuizz. Alleen als je zelf een API-key invult gaan je prompts naar die aanbieder. Het lokale AI-model wordt eenmalig van Hugging Face gedownload. Live spelen gebruikt WebRTC met publieke signalling-relays (Nostr) en is end-to-end versleuteld.

## Zelf hosten / ontwikkelen

```bash
npm install
npm run dev          # http://localhost:5173/MyQuiz/
npm run check        # lint + typecheck + unit tests + build
npm run e2e          # Playwright (PW_CHROMIUM=/pad/naar/chrome voor een eigen Chromium)
```

Deploy naar GitHub Pages gebeurt automatisch via `.github/workflows/deploy.yml` bij een push op `main`. Eenmalig in de repo: **Settings → Pages → Build and deployment → Source: GitHub Actions**. Ander pad dan `/MyQuiz/`? Zet `VITE_BASE` bij de build.

Optioneel: `extras/cloudflare-worker/` bevat een gratis te hosten proxy met rate limit als je als beheerder zelf een AI-key wilt aanbieden aan gebruikers.

## Techniek

React 19 · TypeScript · Vite 8 · Tailwind CSS v4 · Dexie (IndexedDB) · ts-fsrs · i18next · trystero (WebRTC) · @mlc-ai/web-llm · vite-plugin-pwa · Vitest · Playwright

---

## English

**MyQuizz is a free quiz and flashcard app that runs entirely in your browser.** No account, no server, no cost. Everything is stored locally, you can export, import and share sets with colleagues, and the app installs as a PWA and works offline.

Highlights: full set editor with images, cloze and image occlusion; import from paste, CSV/TSV, Anki (`.txt`/`.apkg`), Quizlet and JSON; export to six formats and encrypted ZIP backups; sharing via link, QR, file, embed and calendar; Flashcards, FSRS spaced repetition, Learn, Write, Spell and Test modes; seven games (Match, Blocks, Blast, Charms, Hangman, Word Search, Speed Review); serverless peer-to-peer live games with room codes; layered free AI (heuristics always, local WebLLM model after consent, Chrome built-in AI, or your own API key) for card generation, explanations, tutor, study guides, practice tests and a listen mode; achievements, streaks and statistics; Dutch and English; light and dark.

**Make cards with your own AI (no key):** open **AI → Import with your own AI** (`#/import/ai`), copy the prompt, upload your sources (PDF, screenshots, link, notes) to ChatGPT, Claude, Gemini or Copilot together with the prompt, and paste the answer back (the whole ```json block or TSV lines). Prompt files: [`public/ai/myquizz-import-skill.md`](public/ai/myquizz-import-skill.md), [`public/ai/myquizz-import-skill.nl.md`](public/ai/myquizz-import-skill.nl.md) and the agent skill [`skills/myquizz-import/SKILL.md`](skills/myquizz-import/SKILL.md).

Deploy: push to `main`; once, set **Settings → Pages → Source: GitHub Actions** in the repository.

MIT licensed.
