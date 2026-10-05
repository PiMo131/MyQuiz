import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/db/db'
import { finishSession, getCards, getScore, recordOutcome, recordScore, startSession } from '@/db/repo'
import type { Card, Session, SessionAnswer, StudySet } from '@/domain/types'
import { playableCards, type PromptSide } from '@/domain/games/questions'
import { gameMeta, type GameId } from './gameMeta'

export interface BaseGameOptions {
  starredOnly: boolean
  promptSide: PromptSide
}

export const DEFAULT_GAME_OPTIONS: BaseGameOptions = { starredOnly: false, promptSide: 'term' }

/** Per-game options persisted per browser (convenience only). */
export function useGameOptions<T extends BaseGameOptions>(game: GameId, defaults: T): [T, (patch: Partial<T>) => void] {
  const key = `myquizz.games.${game}.options`
  const [opts, setOpts] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key)
      return raw ? { ...defaults, ...(JSON.parse(raw) as Partial<T>) } : defaults
    } catch {
      return defaults
    }
  })
  const update = useCallback(
    (patch: Partial<T>) =>
      setOpts((o) => {
        const next = { ...o, ...patch }
        try {
          localStorage.setItem(key, JSON.stringify(next))
        } catch {
          /* ignore */
        }
        return next
      }),
    [key],
  )
  return [opts, update]
}

/** Loads a set and its playable cards. */
export function useGameCards(setId: string | undefined, starredOnly = false): { set: StudySet | undefined; cards: Card[]; allCards: Card[]; loading: boolean } {
  const setRow = useLiveQuery(async (): Promise<{ set: StudySet | undefined }> => ({ set: setId ? await db.sets.get(setId) : undefined }), [setId])
  const all = useLiveQuery(async (): Promise<Card[]> => (setId ? getCards(setId) : []), [setId])
  const cards = useMemo(() => playableCards(all ?? [], starredOnly), [all, starredOnly])
  return { set: setRow?.set, cards, allCards: all ?? [], loading: setRow === undefined || all === undefined }
}

/** Live best score for a set/game. */
export function useBestScore(setId: string | undefined, game: GameId): number | undefined {
  const score = useLiveQuery(async (): Promise<{ best?: number }> => ({ best: setId ? (await getScore(setId, game))?.best : undefined }), [setId, game])
  return score?.best
}

export interface GameSessionApi {
  begin: (settings?: Record<string, unknown>) => Promise<void>
  /** Log one question outcome (progress + revlog + session answer). */
  answer: (card: Card, correct: boolean, given: string, expected: string, side: PromptSide, durationMs?: number) => void
  /** Finish: record score + session. Returns best info. */
  end: (score: number, total?: number) => Promise<{ best: number; isNewBest: boolean }>
  answers: () => SessionAnswer[]
}

/** Session + score bookkeeping shared by all games. */
export function useGameSession(setId: string | undefined, game: GameId): GameSessionApi {
  const session = useRef<Session | null>(null)
  const answers = useRef<SessionAnswer[]>([])
  const meta = gameMeta(game)
  return useMemo<GameSessionApi>(
    () => ({
      begin: async (settings) => {
        if (!setId) return
        answers.current = []
        session.current = await startSession(setId, game, settings)
      },
      answer: (card, correct, given, expected, side, durationMs = 0) => {
        answers.current.push({ cardId: card.id, questionType: 'multipleChoice', prompt: side === 'term' ? card.term : card.definition, given, expected, correct, durationMs })
        void recordOutcome(card, correct, game, side === 'term' ? 'forward' : 'reverse', durationMs).catch(() => undefined)
      },
      end: async (score, total) => {
        if (!setId) return { best: score, isNewBest: false }
        const res = await recordScore(setId, game, score, meta.lowerIsBetter)
        if (session.current) {
          await finishSession(session.current, { score, total, answers: answers.current })
          session.current = null
        }
        return res
      },
      answers: () => answers.current,
    }),
    [setId, game, meta.lowerIsBetter],
  )
}

/** True while the document is visible; games pause when it is not. */
export function useDocumentVisible(): boolean {
  const [visible, setVisible] = useState(() => (typeof document === 'undefined' ? true : document.visibilityState !== 'hidden'))
  useEffect(() => {
    const on = () => setVisible(document.visibilityState !== 'hidden')
    document.addEventListener('visibilitychange', on)
    return () => document.removeEventListener('visibilitychange', on)
  }, [])
  return visible
}

/** Elapsed-time ticker (ms) that pauses when `running` is false or the tab is hidden. Resolution ~100 ms. */
export function useStopwatch(running: boolean, resetKey: unknown): number {
  const [elapsed, setElapsed] = useState(0)
  const visible = useDocumentVisible()
  const acc = useRef(0)
  const startedAt = useRef<number | null>(null)
  useEffect(() => {
    acc.current = 0
    startedAt.current = null
    setElapsed(0)
  }, [resetKey])
  useEffect(() => {
    const active = running && visible
    if (!active) {
      if (startedAt.current !== null) {
        acc.current += performance.now() - startedAt.current
        startedAt.current = null
        setElapsed(acc.current)
      }
      return
    }
    startedAt.current = performance.now()
    const id = window.setInterval(() => {
      if (startedAt.current !== null) setElapsed(acc.current + performance.now() - startedAt.current)
    }, 100)
    return () => window.clearInterval(id)
  }, [running, visible])
  return elapsed
}

/** Window keydown listener helper. */
export function useKeydown(handler: (e: KeyboardEvent) => void, active = true) {
  const ref = useRef(handler)
  ref.current = handler
  useEffect(() => {
    if (!active) return
    const on = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return
      ref.current(e)
    }
    window.addEventListener('keydown', on)
    return () => window.removeEventListener('keydown', on)
  }, [active])
}

export function rememberLastSet(setId: string) {
  try {
    localStorage.setItem('myquizz.games.lastSet', setId)
  } catch {
    /* ignore */
  }
}
