/**
 * Pure question generation for Learn / Test / Write modes.
 * No React, no DB: cards in, questions out. Deterministic with a seed.
 */
import type { Card, GradingOptions, Id, QuestionType, Side, Variant } from './types'
import { clozeIndices, renderCloze } from './cloze'
import { gradeAnswer } from './grading'
import { mulberry32, normalize, plainText, shuffle } from './text'

export type AnswerWith = Side | 'both'

export interface ImageOptions {
  questions: boolean
  choices: boolean
}

export interface GeneratorOptions {
  answerWith: AnswerWith
  images?: Partial<ImageOptions>
  seed?: number
  rng?: () => number
}

export interface Option {
  cardId: Id
  text: string
  image?: Id
}

interface Base {
  id: string
  cardId: Id
  variant: Variant
  promptSide: Side
  answerSide: Side
  prompt: string
  promptImage?: Id
  answer: string
}

export interface MultipleChoiceQuestion extends Base {
  type: 'multipleChoice'
  options: Option[]
  correctIndex: number
}
export interface TrueFalseQuestion extends Base {
  type: 'trueFalse'
  /** The answer that is shown next to the prompt (may belong to another card). */
  shown: string
  shownImage?: Id
  isTrue: boolean
}
export interface WrittenQuestion extends Base {
  type: 'written'
  accepted: string[]
}
export interface FlashcardQuestion extends Base {
  type: 'flashcard'
}
export interface FillBlankQuestion extends Base {
  type: 'fillBlank'
  accepted: string[]
  full: string
}
export interface MatchPair {
  cardId: Id
  left: string
  leftImage?: Id
  right: string
  rightImage?: Id
}
export interface MatchingQuestion {
  id: string
  type: 'matching'
  cardIds: Id[]
  promptSide: Side
  answerSide: Side
  pairs: MatchPair[]
  /** Answer chips in display order. */
  options: Option[]
}
export interface OrderingQuestion {
  id: string
  type: 'ordering'
  cardIds: Id[]
  side: Side
  /** Items in display (shuffled) order. */
  items: Option[]
  /** Card ids in the correct order. */
  correctOrder: Id[]
}
export interface MultiSelectQuestion {
  id: string
  type: 'multiSelect'
  cardIds: Id[]
  promptSide: Side
  answerSide: Side
  prompts: string[]
  options: Array<Option & { correct: boolean }>
}

export type Question =
  | MultipleChoiceQuestion
  | TrueFalseQuestion
  | WrittenQuestion
  | FlashcardQuestion
  | FillBlankQuestion
  | MatchingQuestion
  | OrderingQuestion
  | MultiSelectQuestion

export type SingleCardQuestion = MultipleChoiceQuestion | TrueFalseQuestion | WrittenQuestion | FlashcardQuestion | FillBlankQuestion

/** What the user answered, per question type. */
export type Response =
  | { type: 'multipleChoice'; index: number | null }
  | { type: 'trueFalse'; value: boolean | null }
  | { type: 'written'; text: string }
  | { type: 'fillBlank'; text: string }
  | { type: 'flashcard'; known: boolean | null }
  | { type: 'matching'; slots: Array<Id | null> }
  | { type: 'ordering'; order: Id[] }
  | { type: 'multiSelect'; selected: number[] }

export interface GradeOutcome {
  correct: boolean
  /** Per card outcome (matching/ordering/multiSelect contain several cards). */
  perCard: Array<{ cardId: Id; correct: boolean }>
  /** Human readable expected answer (for feedback). */
  expected: string
  given: string
}

// ---------- helpers ----------

export function otherSide(side: Side): Side {
  return side === 'term' ? 'definition' : 'term'
}

export function cardText(card: Card, side: Side): string {
  return side === 'term' ? card.term : card.definition
}

export function cardImage(card: Card, side: Side): Id | undefined {
  return side === 'term' ? card.image?.term : card.image?.definition
}

export function variantFor(answerSide: Side): Variant {
  return answerSide === 'term' ? 'reverse' : 'forward'
}

/** Pick the prompt side for a card according to the answerWith option. */
export function pickPromptSide(answerWith: AnswerWith, rng: () => number): Side {
  if (answerWith === 'both') return rng() < 0.5 ? 'term' : 'definition'
  // "answer with term" means the term is the answer -> the definition is shown.
  return otherSide(answerWith)
}

export function acceptedAnswers(card: Card, answerSide: Side): string[] {
  const main = cardText(card, answerSide)
  const extra = answerSide === 'definition' ? (card.altAnswers ?? []) : []
  return uniqueText([main, ...extra])
}

function uniqueText(list: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const s of list) {
    const key = normalize(s)
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(s)
  }
  return out
}

function rngFrom(opts: GeneratorOptions): () => number {
  return opts.rng ?? mulberry32(opts.seed ?? 1)
}

function imageOpts(opts: GeneratorOptions): ImageOptions {
  return { questions: opts.images?.questions ?? true, choices: opts.images?.choices ?? true }
}

/**
 * Distractors for a card: user supplied `card.distractors` first, then answers of other cards
 * with a similar length. Never duplicates and never the correct answer.
 */
export function pickDistractors(card: Card, pool: Card[], n: number, answerSide: Side, rng: () => number = Math.random): Option[] {
  const correct = cardText(card, answerSide)
  const correctKey = normalize(correct)
  const seen = new Set<string>([correctKey])
  const out: Option[] = []
  const push = (o: Option) => {
    const key = normalize(o.text)
    if (!key || seen.has(key)) return false
    seen.add(key)
    out.push(o)
    return true
  }
  for (const d of card.distractors ?? []) {
    if (out.length >= n) break
    push({ cardId: card.id, text: d })
  }
  if (out.length < n) {
    const len = plainText(correct).length
    const candidates = pool
      .filter((c) => c.id !== card.id && !c.suspended)
      .map((c) => ({ c, text: cardText(c, answerSide), diff: Math.abs(plainText(cardText(c, answerSide)).length - len), r: rng() }))
      .filter((x) => plainText(x.text).length > 0)
      .sort((a, b) => a.diff - b.diff || a.r - b.r)
    for (const x of candidates) {
      if (out.length >= n) break
      push({ cardId: x.c.id, text: x.text, image: cardImage(x.c, answerSide) })
    }
  }
  return out
}

let seq = 0
function qid(prefix: string): string {
  seq = (seq + 1) % 1_000_000
  return `${prefix}-${seq.toString(36)}`
}

// ---------- single question builders ----------

export function makeMultipleChoice(card: Card, pool: Card[], opts: GeneratorOptions, promptSide?: Side): MultipleChoiceQuestion {
  const rng = rngFrom(opts)
  const ps = promptSide ?? pickPromptSide(opts.answerWith, rng)
  const as = otherSide(ps)
  const img = imageOpts(opts)
  const correct: Option = { cardId: card.id, text: cardText(card, as), image: img.choices ? cardImage(card, as) : undefined }
  const distractors = pickDistractors(card, pool, 3, as, rng).map((o) => ({ ...o, image: img.choices ? o.image : undefined }))
  const options = shuffle([correct, ...distractors], rng)
  return {
    id: qid('mc'),
    type: 'multipleChoice',
    cardId: card.id,
    variant: variantFor(as),
    promptSide: ps,
    answerSide: as,
    prompt: cardText(card, ps),
    promptImage: img.questions ? cardImage(card, ps) : undefined,
    answer: correct.text,
    options,
    correctIndex: options.indexOf(correct),
  }
}

export function makeTrueFalse(card: Card, pool: Card[], opts: GeneratorOptions, promptSide?: Side): TrueFalseQuestion {
  const rng = rngFrom(opts)
  const ps = promptSide ?? pickPromptSide(opts.answerWith, rng)
  const as = otherSide(ps)
  const img = imageOpts(opts)
  const alternatives = pickDistractors(card, pool, 1, as, rng)
  const isTrue = alternatives.length === 0 || rng() < 0.5
  const shown = isTrue ? { cardId: card.id, text: cardText(card, as), image: cardImage(card, as) } : alternatives[0]
  return {
    id: qid('tf'),
    type: 'trueFalse',
    cardId: card.id,
    variant: variantFor(as),
    promptSide: ps,
    answerSide: as,
    prompt: cardText(card, ps),
    promptImage: img.questions ? cardImage(card, ps) : undefined,
    answer: cardText(card, as),
    shown: shown.text,
    shownImage: img.choices ? shown.image : undefined,
    isTrue,
  }
}

export function makeWritten(card: Card, opts: GeneratorOptions, promptSide?: Side): WrittenQuestion {
  const rng = rngFrom(opts)
  const ps = promptSide ?? pickPromptSide(opts.answerWith, rng)
  const as = otherSide(ps)
  const img = imageOpts(opts)
  return {
    id: qid('wr'),
    type: 'written',
    cardId: card.id,
    variant: variantFor(as),
    promptSide: ps,
    answerSide: as,
    prompt: cardText(card, ps),
    promptImage: img.questions ? cardImage(card, ps) : undefined,
    answer: cardText(card, as),
    accepted: acceptedAnswers(card, as),
  }
}

export function makeFlashcard(card: Card, opts: GeneratorOptions, promptSide?: Side): FlashcardQuestion {
  const rng = rngFrom(opts)
  const ps = promptSide ?? pickPromptSide(opts.answerWith, rng)
  const as = otherSide(ps)
  return {
    id: qid('fc'),
    type: 'flashcard',
    cardId: card.id,
    variant: variantFor(as),
    promptSide: ps,
    answerSide: as,
    prompt: cardText(card, ps),
    promptImage: cardImage(card, ps),
    answer: cardText(card, as),
  }
}

/** Fill-in-the-blank from a cloze card; `n` is the cloze index (c1, c2, …). */
export function makeFillBlank(card: Card, n: number): FillBlankQuestion | undefined {
  if (!card.cloze) return undefined
  const { question, answers, full } = renderCloze(card.cloze, n)
  if (!answers.length) return undefined
  return {
    id: qid('fb'),
    type: 'fillBlank',
    cardId: card.id,
    variant: `cloze:${n}`,
    promptSide: 'term',
    answerSide: 'definition',
    prompt: question,
    answer: answers.join(' / '),
    accepted: uniqueText(answers),
    full,
  }
}

/** Matching group of 3–6 cards. */
export function makeMatching(cards: Card[], opts: GeneratorOptions): MatchingQuestion {
  const rng = rngFrom(opts)
  const ps = opts.answerWith === 'both' ? (rng() < 0.5 ? 'term' : 'definition') : otherSide(opts.answerWith)
  const as = otherSide(ps)
  const img = imageOpts(opts)
  const pairs: MatchPair[] = cards.map((c) => ({
    cardId: c.id,
    left: cardText(c, ps),
    leftImage: img.questions ? cardImage(c, ps) : undefined,
    right: cardText(c, as),
    rightImage: img.choices ? cardImage(c, as) : undefined,
  }))
  const options = shuffle(
    pairs.map((p) => ({ cardId: p.cardId, text: p.right, image: p.rightImage })),
    rng,
  )
  return { id: qid('mt'), type: 'matching', cardIds: cards.map((c) => c.id), promptSide: ps, answerSide: as, pairs, options }
}

/** Ordering: put cards back in their original set order. */
export function makeOrdering(cards: Card[], opts: GeneratorOptions, side: Side = 'term'): OrderingQuestion {
  const rng = rngFrom(opts)
  const sorted = cards.slice().sort((a, b) => a.position - b.position)
  const items = sorted.map((c) => ({ cardId: c.id, text: cardText(c, side), image: cardImage(c, side) }))
  let shuffled = shuffle(items, rng)
  if (items.length > 1 && shuffled.every((it, i) => it.cardId === items[i].cardId)) shuffled = [...shuffled.slice(1), shuffled[0]]
  return { id: qid('or'), type: 'ordering', cardIds: sorted.map((c) => c.id), side, items: shuffled, correctOrder: sorted.map((c) => c.id) }
}

/** Multi-select: 2–3 prompts, select every answer that belongs to them. */
export function makeMultiSelect(cards: Card[], pool: Card[], opts: GeneratorOptions): MultiSelectQuestion {
  const rng = rngFrom(opts)
  const ps = opts.answerWith === 'both' ? (rng() < 0.5 ? 'term' : 'definition') : otherSide(opts.answerWith)
  const as = otherSide(ps)
  const img = imageOpts(opts)
  const correct = cards.map((c) => ({ cardId: c.id, text: cardText(c, as), image: img.choices ? cardImage(c, as) : undefined, correct: true }))
  const taken = new Set(correct.map((o) => normalize(o.text)))
  const others = shuffle(
    pool.filter((c) => !cards.some((x) => x.id === c.id) && !taken.has(normalize(cardText(c, as)))),
    rng,
  )
  const wrong: Array<Option & { correct: boolean }> = []
  for (const c of others) {
    if (correct.length + wrong.length >= 6) break
    const key = normalize(cardText(c, as))
    if (taken.has(key)) continue
    taken.add(key)
    wrong.push({ cardId: c.id, text: cardText(c, as), image: img.choices ? cardImage(c, as) : undefined, correct: false })
  }
  return {
    id: qid('ms'),
    type: 'multiSelect',
    cardIds: cards.map((c) => c.id),
    promptSide: ps,
    answerSide: as,
    prompts: cards.map((c) => cardText(c, ps)),
    options: shuffle([...correct, ...wrong], rng),
  }
}

// ---------- test composition ----------

export interface TestConfig extends GeneratorOptions {
  count: number
  types: QuestionType[]
}

export const TYPE_ORDER: QuestionType[] = ['trueFalse', 'multipleChoice', 'matching', 'written', 'ordering', 'multiSelect', 'fillBlank', 'flashcard']

export function clozeCards(cards: Card[]): Card[] {
  return cards.filter((c) => !!c.cloze && clozeIndices(c.cloze).length > 0)
}

/** How many questions a question object counts for in a test (matching groups count per pair). */
export function questionWeight(q: Question): number {
  if (q.type === 'matching') return q.pairs.length
  return 1
}

/**
 * Build a test: `count` questions spread evenly over the enabled types, in section order.
 * Matching uses groups of 3–6 cards; fillBlank only uses cloze cards.
 */
export function generateTest(cards: Card[], config: TestConfig): Question[] {
  const rng = rngFrom(config)
  const opts: GeneratorOptions = { ...config, rng }
  const usable = cards.filter((c) => !c.suspended && (plainText(c.term) || plainText(c.definition)))
  if (!usable.length) return []
  const cloze = clozeCards(usable)
  let types = TYPE_ORDER.filter((t) => config.types.includes(t) && t !== 'flashcard')
  if (!cloze.length) types = types.filter((t) => t !== 'fillBlank')
  if (usable.length < 3) types = types.filter((t) => t !== 'matching')
  if (usable.length < 2) types = types.filter((t) => t !== 'ordering' && t !== 'multiSelect' && t !== 'trueFalse' && t !== 'multipleChoice')
  if (!types.length) types = ['written']
  const total = Math.max(1, Math.min(config.count, usable.length))
  const pool = shuffle(usable, rng)

  // Even split, remainder to the first types.
  const per = types.map((_, i) => Math.floor(total / types.length) + (i < total % types.length ? 1 : 0))
  const out: Question[] = []
  let cursor = 0
  const take = (n: number): Card[] => {
    const slice: Card[] = []
    for (let i = 0; i < n; i++) slice.push(pool[(cursor + i) % pool.length])
    cursor += n
    return slice
  }

  types.forEach((type, ti) => {
    let budget = per[ti]
    if (!budget) return
    switch (type) {
      case 'trueFalse':
        for (const c of take(budget)) out.push(makeTrueFalse(c, usable, opts))
        break
      case 'multipleChoice':
        for (const c of take(budget)) out.push(makeMultipleChoice(c, usable, opts))
        break
      case 'written':
        for (const c of take(budget)) out.push(makeWritten(c, opts))
        break
      case 'matching': {
        while (budget > 0) {
          const size = Math.min(6, Math.max(3, budget))
          if (size > usable.length) break
          out.push(makeMatching(take(size), opts))
          budget -= size
        }
        break
      }
      case 'ordering': {
        while (budget > 0) {
          const size = Math.min(5, Math.max(2, budget), usable.length)
          out.push(makeOrdering(take(size), opts))
          budget -= size
        }
        break
      }
      case 'multiSelect': {
        while (budget > 0) {
          const size = Math.min(3, Math.max(2, budget), usable.length)
          out.push(makeMultiSelect(take(size), usable, opts))
          budget -= size
        }
        break
      }
      case 'fillBlank': {
        const shuffledCloze = shuffle(cloze, rng)
        let i = 0
        while (budget > 0 && shuffledCloze.length) {
          const c = shuffledCloze[i % shuffledCloze.length]
          const idx = clozeIndices(c.cloze!)
          const q = makeFillBlank(c, idx[Math.floor(rng() * idx.length)])
          if (q) out.push(q)
          budget--
          i++
        }
        break
      }
      default:
        break
    }
  })
  return out
}

// ---------- grading ----------

export function emptyResponse(q: Question): Response {
  switch (q.type) {
    case 'multipleChoice':
      return { type: 'multipleChoice', index: null }
    case 'trueFalse':
      return { type: 'trueFalse', value: null }
    case 'written':
      return { type: 'written', text: '' }
    case 'fillBlank':
      return { type: 'fillBlank', text: '' }
    case 'flashcard':
      return { type: 'flashcard', known: null }
    case 'matching':
      return { type: 'matching', slots: q.pairs.map(() => null) }
    case 'ordering':
      return { type: 'ordering', order: q.items.map((i) => i.cardId) }
    case 'multiSelect':
      return { type: 'multiSelect', selected: [] }
  }
}

export function isAnswered(q: Question, r: Response | undefined): boolean {
  if (!r) return false
  switch (r.type) {
    case 'multipleChoice':
      return r.index !== null
    case 'trueFalse':
      return r.value !== null
    case 'written':
    case 'fillBlank':
      return r.text.trim().length > 0
    case 'flashcard':
      return r.known !== null
    case 'matching':
      return r.slots.every((s) => s !== null)
    case 'ordering':
      return q.type === 'ordering' && r.order.length === q.items.length
    case 'multiSelect':
      return r.selected.length > 0
  }
}

export function gradeQuestion(q: Question, r: Response | undefined, grading: Partial<GradingOptions> = {}): GradeOutcome {
  const res = r ?? emptyResponse(q)
  switch (q.type) {
    case 'multipleChoice': {
      const idx = res.type === 'multipleChoice' ? res.index : null
      const correct = idx === q.correctIndex
      return { correct, perCard: [{ cardId: q.cardId, correct }], expected: q.answer, given: idx === null ? '' : q.options[idx]?.text ?? '' }
    }
    case 'trueFalse': {
      const v = res.type === 'trueFalse' ? res.value : null
      const correct = v === q.isTrue
      return { correct, perCard: [{ cardId: q.cardId, correct }], expected: q.isTrue ? 'true' : 'false', given: v === null ? '' : v ? 'true' : 'false' }
    }
    case 'written':
    case 'fillBlank': {
      const text = res.type === 'written' || res.type === 'fillBlank' ? res.text : ''
      const g = gradeAnswer(text, q.accepted, grading)
      return { correct: g.correct, perCard: [{ cardId: q.cardId, correct: g.correct }], expected: q.answer, given: text }
    }
    case 'flashcard': {
      const known = res.type === 'flashcard' ? res.known : null
      const correct = known === true
      return { correct, perCard: [{ cardId: q.cardId, correct }], expected: q.answer, given: known === null ? '' : known ? 'known' : 'unknown' }
    }
    case 'matching': {
      const slots = res.type === 'matching' ? res.slots : q.pairs.map(() => null)
      const perCard = q.pairs.map((p, i) => ({ cardId: p.cardId, correct: slots[i] === p.cardId }))
      return { correct: perCard.every((x) => x.correct), perCard, expected: q.pairs.map((p) => `${p.left} → ${p.right}`).join('\n'), given: '' }
    }
    case 'ordering': {
      const order = res.type === 'ordering' ? res.order : []
      const perCard = q.correctOrder.map((id, i) => ({ cardId: id, correct: order[i] === id }))
      return { correct: perCard.every((x) => x.correct), perCard, expected: q.correctOrder.map((id) => q.items.find((it) => it.cardId === id)?.text ?? '').join(' → '), given: order.map((id) => q.items.find((it) => it.cardId === id)?.text ?? '').join(' → ') }
    }
    case 'multiSelect': {
      const selected = new Set(res.type === 'multiSelect' ? res.selected : [])
      const allRight = q.options.every((o, i) => o.correct === selected.has(i))
      const perCard = q.cardIds.map((id) => ({ cardId: id, correct: q.options.every((o, i) => o.cardId !== id || !o.correct || selected.has(i)) && allRight }))
      return {
        correct: allRight,
        perCard,
        expected: q.options.filter((o) => o.correct).map((o) => o.text).join(', '),
        given: q.options.filter((_, i) => selected.has(i)).map((o) => o.text).join(', '),
      }
    }
  }
}

/** Card ids touched by a question. */
export function questionCardIds(q: Question): Id[] {
  return 'cardIds' in q ? q.cardIds : [q.cardId]
}
