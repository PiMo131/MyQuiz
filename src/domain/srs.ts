import {
  createEmptyCard,
  fsrs,
  generatorParameters,
  Rating as FsrsRating,
  State,
  type Card as FsrsCard,
  type FSRS,
  type Grade,
} from 'ts-fsrs'
import type { Bucket, FsrsState, Progress, Rating, SrsParams, Variant } from './types'
import { DEFAULT_SRS } from './types'

export const RATINGS: Rating[] = [1, 2, 3, 4]
export const RATING_LABEL_KEYS: Record<Rating, string> = { 1: 'again', 2: 'hard', 3: 'good', 4: 'easy' }

export function makeScheduler(params: Partial<SrsParams> = {}): FSRS {
  const p = { ...DEFAULT_SRS, ...params }
  return fsrs(
    generatorParameters({
      request_retention: p.requestRetention,
      maximum_interval: p.maximumInterval,
      enable_fuzz: p.enableFuzz,
      enable_short_term: true,
      learning_steps: p.learningSteps as never,
      relearning_steps: p.relearningSteps as never,
    }),
  )
}

export function emptyFsrsState(now = Date.now()): FsrsState {
  const c = createEmptyCard(new Date(now))
  return toState(c)
}

export function toState(c: FsrsCard): FsrsState {
  return {
    due: c.due.getTime(),
    stability: c.stability,
    difficulty: c.difficulty,
    elapsed_days: c.elapsed_days,
    scheduled_days: c.scheduled_days,
    learning_steps: c.learning_steps,
    reps: c.reps,
    lapses: c.lapses,
    state: c.state as FsrsState['state'],
    last_review: c.last_review ? c.last_review.getTime() : undefined,
  }
}

export function toFsrsCard(s: FsrsState): FsrsCard {
  return {
    due: new Date(s.due),
    stability: s.stability,
    difficulty: s.difficulty,
    elapsed_days: s.elapsed_days,
    scheduled_days: s.scheduled_days,
    learning_steps: s.learning_steps,
    reps: s.reps,
    lapses: s.lapses,
    state: s.state as State,
    last_review: s.last_review ? new Date(s.last_review) : undefined,
  }
}

export function bucketFor(s: FsrsState, correct?: number, incorrect?: number): Bucket {
  if (s.state === State.New && !s.reps) return 'new'
  if (s.state === State.Review && s.stability >= 21 && s.scheduled_days >= 21) return 'mastered'
  if (s.state === State.Review || (correct ?? 0) >= 2 && (incorrect ?? 0) === 0) return 'known'
  return 'learning'
}

export interface ReviewPreview {
  rating: Rating
  due: number
  intervalDays: number
  label: string // '<1m', '10m', '4d', ...
}

export function formatInterval(ms: number, now = Date.now()): string {
  const diff = Math.max(0, ms - now)
  const min = Math.round(diff / 60000)
  if (min < 1) return '<1m'
  if (min < 60) return `${min}m`
  const h = Math.round(min / 60)
  if (h < 24) return `${h}h`
  const d = Math.round(h / 24)
  if (d < 31) return `${d}d`
  const mo = Math.round(d / 30)
  if (mo < 12) return `${mo}mo`
  return `${Math.round(d / 365)}y`
}

/** Preview all four outcomes for a card (for the Repeat/Hard/Okay/Easy buttons). */
export function previewRatings(f: FSRS, s: FsrsState, now = Date.now()): ReviewPreview[] {
  const preview = f.repeat(toFsrsCard(s), new Date(now))
  return RATINGS.map((r) => {
    const item = preview[r as Grade]
    return {
      rating: r,
      due: item.card.due.getTime(),
      intervalDays: item.card.scheduled_days,
      label: formatInterval(item.card.due.getTime(), now),
    }
  })
}

export interface ReviewOutcome {
  fsrs: FsrsState
  bucket: Bucket
  log: { rating: Rating; state: FsrsState['state']; scheduledDays: number; elapsedDays: number }
  leech: boolean
}

export function applyRating(
  f: FSRS,
  s: FsrsState,
  rating: Rating,
  now = Date.now(),
  params: Partial<SrsParams> = {},
): ReviewOutcome {
  const p = { ...DEFAULT_SRS, ...params }
  const rec = f.next(toFsrsCard(s), new Date(now), rating as Grade)
  const next = toState(rec.card)
  return {
    fsrs: next,
    bucket: bucketFor(next),
    log: {
      rating,
      state: rec.log.state as FsrsState['state'],
      scheduledDays: rec.log.scheduled_days,
      elapsedDays: rec.log.elapsed_days,
    },
    leech: next.lapses >= p.leechThreshold,
  }
}

/** Map Brainscape-style confidence (1-5) to an FSRS rating. */
export function confidenceToRating(c: 1 | 2 | 3 | 4 | 5): Rating {
  return c <= 1 ? 1 : c === 2 ? 2 : c <= 4 ? 3 : 4
}

export function isDue(s: FsrsState, now = Date.now()): boolean {
  return s.due <= now
}

export interface DailyPlan {
  due: Progress[]
  fresh: Progress[]
}

/** Build today's plan: due reviews first (by due), then new cards up to the daily limit. */
export function dailyPlan(all: Progress[], params: Partial<SrsParams> = {}, now = Date.now()): DailyPlan {
  const p = { ...DEFAULT_SRS, ...params }
  const due = all
    .filter((x) => x.fsrs.state !== State.New && isDue(x.fsrs, now))
    .sort((a, b) => a.fsrs.due - b.fsrs.due)
    .slice(0, p.reviewsPerDay)
  const fresh = all.filter((x) => x.fsrs.state === State.New).slice(0, p.newPerDay)
  return { due, fresh }
}

export function progressId(cardId: string, variant: Variant): string {
  return `${cardId}:${variant}`
}

export { FsrsRating, State }
