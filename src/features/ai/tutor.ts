/** Heuristic "Ask AI" tutor: works fully offline on the cards of a set. */
import type { Card } from '@/domain/types'
import { gradeAnswer } from '@/domain/grading'
import { plainText, sample, shuffle } from '@/domain/text'
import { acrosticMnemonic, mnemonicCue } from '@/domain/ai/mnemonics'
import { normalize } from '@/domain/text'

export type StarterId = 'stump' | 'mnemonics' | 'concepts'
export const STARTERS: StarterId[] = ['stump', 'mnemonics', 'concepts']

export interface TutorState {
  mode: 'idle' | 'quiz'
  pendingCardId?: string
  asked: string[]
  score: { correct: number; total: number }
}

export const initialTutorState = (): TutorState => ({ mode: 'idle', asked: [], score: { correct: 0, total: 0 } })

export interface TutorStrings {
  quizIntro: string
  quizQuestion: (term: string) => string
  quizCorrect: (answer: string) => string
  quizWrong: (given: string, answer: string) => string
  quizDone: (correct: number, total: number) => string
  concepts: (n: number) => string
  mnemonicsIntro: string
  acrostic: (letters: string, hint: string) => string
  found: (n: number) => string
  notFound: string
  stopQuiz: string
}

export function tutorStrings(lang: string): TutorStrings {
  if (lang.startsWith('nl'))
    return {
      quizIntro: 'Oké, ik ga je proberen te verrassen! Hier komt je eerste vraag:',
      quizQuestion: (term) => `**Wat hoort bij "${term}"?**`,
      quizCorrect: (answer) => `✅ Goed! Het antwoord was inderdaad *${answer}*.`,
      quizWrong: (given, answer) => `❌ Niet helemaal. Je zei *${given || '…'}*, het juiste antwoord is **${answer}**.`,
      quizDone: (c, t) => `Dat was de hele set! Score: **${c}/${t}**. Typ "nog een keer" om opnieuw te beginnen.`,
      concepts: (n) => `Deze set heeft ${n} kernbegrippen:`,
      mnemonicsIntro: 'Een paar geheugensteuntjes voor deze set:',
      acrostic: (letters, hint) => `Acrostichon van de eerste termen: **${letters}** — ${hint}`,
      found: (n) => (n === 1 ? 'Dit vond ik in de set:' : `Ik vond ${n} kaarten die hierbij passen:`),
      notFound: 'Daar kan ik in deze set niets over vinden. Probeer een term uit de set, of kies een van de opties hierboven. Met een lokaal AI-model of eigen sleutel kan ik vrijer antwoorden.',
      stopQuiz: 'Quiz gestopt. Waar kan ik mee helpen?',
    }
  return {
    quizIntro: "Alright, I'm up for the challenge! Here is your first question:",
    quizQuestion: (term) => `**What goes with "${term}"?**`,
    quizCorrect: (answer) => `✅ Correct! The answer was indeed *${answer}*.`,
    quizWrong: (given, answer) => `❌ Not quite. You said *${given || '…'}*, the correct answer is **${answer}**.`,
    quizDone: (c, t) => `That was the whole set! Score: **${c}/${t}**. Type "again" to start over.`,
    concepts: (n) => `This set has ${n} key concepts:`,
    mnemonicsIntro: 'A few memory cues for this set:',
    acrostic: (letters, hint) => `Acrostic of the first terms: **${letters}** — ${hint}`,
    found: (n) => (n === 1 ? 'I found this in the set:' : `I found ${n} matching cards:`),
    notFound: "I can't find anything about that in this set. Try a term from the set or pick one of the options above. With a local AI model or your own key I can answer more freely.",
    stopQuiz: 'Quiz stopped. What can I help with?',
  }
}

export function starterText(id: StarterId, lang: string): string {
  const nl = lang.startsWith('nl')
  if (id === 'stump') return nl ? 'Probeer me te verrassen' : 'Try to stump me'
  if (id === 'mnemonics') return nl ? 'Leren met ezelsbruggetjes' : 'Study with mnemonics'
  return nl ? 'Wat zijn de kernbegrippen in deze set?' : 'What are the key concepts in this set?'
}

export function detectStarter(text: string): StarterId | null {
  const t = text.toLowerCase()
  if (/stump|verras|quiz|overhoor|test me|toets me/.test(t)) return 'stump'
  if (/mnemonic|ezelsbrug|geheugensteun/.test(t)) return 'mnemonics'
  if (/key concept|kernbegrip|belangrijkste|overzicht|summar|samenvat/.test(t)) return 'concepts'
  return null
}

function nextQuestion(state: TutorState, cards: Card[], s: TutorStrings): { reply: string; state: TutorState } {
  const remaining = cards.filter((c) => !state.asked.includes(c.id))
  if (!remaining.length) {
    return { reply: s.quizDone(state.score.correct, state.score.total), state: { ...state, mode: 'idle', pendingCardId: undefined, asked: [] } }
  }
  const card = sample(remaining, 1)[0]
  return { reply: s.quizQuestion(plainText(card.term)), state: { ...state, mode: 'quiz', pendingCardId: card.id, asked: [...state.asked, card.id] } }
}

/** Produce a heuristic reply to a user message. Pure (no I/O). */
export function heuristicReply(input: string, state: TutorState, cards: Card[], lang: string): { reply: string; state: TutorState } {
  const s = tutorStrings(lang)
  const usable = cards.filter((c) => !c.suspended)
  const text = input.trim()
  const low = text.toLowerCase()

  if (state.mode === 'quiz' && state.pendingCardId) {
    if (/^(stop|quit|klaar|genoeg)\b/.test(low)) return { reply: s.stopQuiz, state: { ...initialTutorState() } }
    const card = usable.find((c) => c.id === state.pendingCardId)
    if (card) {
      const g = gradeAnswer(text, [card.definition, ...(card.altAnswers ?? [])])
      const score = { correct: state.score.correct + (g.correct ? 1 : 0), total: state.score.total + 1 }
      const feedback = g.correct ? s.quizCorrect(plainText(card.definition)) : s.quizWrong(text, plainText(card.definition))
      const next = nextQuestion({ ...state, score }, usable, s)
      return { reply: `${feedback}\n\n${next.reply}`, state: next.state }
    }
  }

  const starter = detectStarter(low) ?? (/^(again|nog een keer|opnieuw)$/.test(low) ? 'stump' : null)
  if (starter === 'stump') {
    const q = nextQuestion({ ...initialTutorState() }, usable, s)
    return { reply: `${s.quizIntro}\n\n${q.reply}`, state: q.state }
  }
  if (starter === 'concepts') {
    const list = usable.map((c) => `- **${plainText(c.term)}** — ${plainText(c.definition)}`).join('\n')
    return { reply: `${s.concepts(usable.length)}\n\n${list}`, state }
  }
  if (starter === 'mnemonics') {
    const picked = shuffle(usable).slice(0, 5)
    const lines = picked.map((c) => `- **${plainText(c.term)}**: ${c.mnemonic ? plainText(c.mnemonic) : mnemonicCue(c.term, c.definition, lang)}`)
    const acro = acrosticMnemonic(usable.slice(0, Math.min(5, usable.length)).map((c) => c.term), lang)
    return { reply: `${s.mnemonicsIntro}\n\n${lines.join('\n')}\n\n${s.acrostic(acro.letters, acro.hint)}`, state }
  }

  // free question: find matching cards by token overlap
  const tokens = normalize(text).split(' ').filter((w) => w.length > 2)
  const scored = usable
    .map((c) => {
      const hay = normalize(`${c.term} ${c.definition} ${c.hint ?? ''}`)
      const hits = tokens.filter((tk) => hay.includes(tk)).length
      return { c, hits }
    })
    .filter((x) => x.hits > 0)
    .sort((a, b) => b.hits - a.hits)
    .slice(0, 3)
  if (scored.length) {
    const lines = scored.map(({ c }) => `- **${plainText(c.term)}** — ${plainText(c.definition)}${c.example ? `\n  _${plainText(c.example)}_` : ''}`)
    return { reply: `${s.found(scored.length)}\n\n${lines.join('\n')}`, state }
  }
  return { reply: s.notFound, state }
}
