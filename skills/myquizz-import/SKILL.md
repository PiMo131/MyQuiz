---
name: myquizz-import
description: Turn a PDF, screenshots, a web page or pasted notes into a MyQuizz flashcard import file (format "myquizz-set" JSON). Use when the user asks for flashcards, a quiz set, study cards or a MyQuizz import from any source material, or mentions MyQuizz. Output only the JSON code block (and optionally the same content as a .myquizz.json file).
---

# MyQuizz import

MyQuizz (https://pimo131.github.io/MyQuiz/) is a free, browser-only quiz and flashcard app. It imports a JSON file with `"format": "myquizz-set"`. This skill produces that file from whatever source the user provides, so the user never needs an API key inside the app.

## When to use
- The user uploads lecture slides, a PDF, screenshots of a book or website, or pastes notes and wants flashcards, a quiz, or "a set for MyQuizz".
- The user shares a URL and asks to study it.
- Not for: summaries, essays or anything that is not meant to be imported.

## Procedure
1. Read all sources. Extract only what is really there; never invent facts. Note unreadable or skipped parts in `set.description`.
2. Decide the card language (source language unless told otherwise) and the set structure: `cardTypes` `["basic"]`, add `"reverse"` for vocabulary, add `"cloze"` when any card uses cloze deletions.
3. Write 10 to 60 cards (or the number the user asks for), one fact per card, with `term` (max 8 words), `definition` (1 to 2 sentences), and where useful `hint`, `mnemonic`, `example`, `altAnswers` (max 10) and `distractors` (exactly 3 plausible wrong answers of the same kind). Cloze cards use `{{c1::answer::hint}}` in `cloze` and still fill `term` and `definition`.
4. Give the set a unique `id` (`ai-<slug>-<yyyymmdd-hhmm>`) and every card an id `<set.id>-001`, `-002`, … Fill `title` (max 80 chars), `description` (max 500 chars, including the source), `tags` (1 to 6), `lang` (BCP-47 per side), `author` ("AI (Claude)").
5. Validate: valid JSON, no trailing commas, no HTML, no `media`/`image`/`audio`, no duplicate cards, distractors are not synonyms of the answer.
6. Reply with **only** one ```json code block containing the object. If file output is available, also provide `<slug>.myquizz.json`. Add at most one line after the block: "Import at https://pimo131.github.io/MyQuiz/#/import/ai".

## Output template

```json
{
  "format": "myquizz-set",
  "version": 1,
  "set": {
    "id": "ai-cell-biology-20261005-1430",
    "title": "Cell biology: organelles",
    "description": "Organelles and their functions from chapter 3 (uploaded PDF). Figure 3.4 was unreadable and skipped.",
    "tags": ["biology", "cells"],
    "lang": { "term": "en", "definition": "en" },
    "cardTypes": ["basic", "cloze"],
    "author": "AI (Claude)"
  },
  "cards": [
    {
      "id": "ai-cell-biology-20261005-1430-001",
      "term": "Mitochondrion",
      "definition": "Organelle that produces ATP through cellular respiration.",
      "hint": "Powerhouse",
      "mnemonic": "Mighty mito makes energy",
      "example": "Muscle cells contain many mitochondria.",
      "altAnswers": ["Mitochondria"],
      "distractors": ["Ribosome", "Golgi apparatus", "Lysosome"]
    },
    {
      "id": "ai-cell-biology-20261005-1430-002",
      "term": "Site of protein synthesis",
      "definition": "Ribosome",
      "cloze": "Proteins are assembled by the {{c1::ribosome::organelle}}."
    }
  ]
}
```

## Fallback
If JSON output is impossible, return tab-separated lines `term<TAB>definition<TAB>hint` with no header and no code fences. MyQuizz imports that too.
