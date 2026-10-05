import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { ChevronLeft, ChevronRight, Trophy } from 'lucide-react'
import { mulberry32 } from '@/domain/text'
import type { Card } from '@/domain/types'
import {
  BLAST_PROMPT_MS,
  BLAST_ROUND_MS,
  BLAST_STREAK_SEGMENTS,
  anyEscaped,
  blastPoints,
  hitAsteroid,
  levelState,
  makeBlastRound,
  spawnAsteroids,
  stepAsteroids,
  type Asteroid,
  type BlastRound,
} from '@/domain/games/blast'
import { cardCycler } from '@/domain/games/questions'
import {
  DEFAULT_GAME_OPTIONS,
  GameEnd,
  GameHeader,
  GameIntro,
  GameLayout,
  GameStatus,
  PausedOverlay,
  formatBest,
  gameMeta,
  useBestScore,
  useGameCards,
  useGameOptions,
  useGameSession,
  useKeydown,
  useSfx,
  type BaseGameOptions,
  type SfxName,
} from '../shared'

export const SHIPS = ['🚀', '🛸', '🛰️', '🦄']

interface BlastOptions extends BaseGameOptions {
  ship: number
}
const DEFAULTS: BlastOptions = { ...DEFAULT_GAME_OPTIONS, promptSide: 'definition', ship: 0 }

type Phase = 'intro' | 'play' | 'end'

interface Particle { x: number; y: number; vx: number; vy: number; life: number; color: string }

interface Game {
  score: number
  streak: number
  bestStreak: number
  hits: number
  misses: number
  level: number
  roundLeft: number
  promptLeft: number
  round: BlastRound<Card> | null
  asteroids: Asteroid[]
  shipAngle: number
  shipTarget: number
  laser: { x: number; y: number; t: number } | null
  particles: Particle[]
  flash: number
  nextId: number
  nextRoundIn: number
  over: boolean
  askedAt: number
  stars: Array<{ x: number; y: number; r: number }>
}

const PALETTE = ['#7c3aed', '#6d28d9', '#8b5cf6']

export default function BlastPage() {
  const { setId = '' } = useParams()
  const { t } = useTranslation(['games', 'common'])
  const [opts, setOpts] = useGameOptions<BlastOptions>('blast', DEFAULTS)
  const { set, cards, loading } = useGameCards(setId, opts.starredOnly)
  const best = useBestScore(setId, 'blast')
  const session = useGameSession(setId, 'blast')
  const play = useSfx()

  const [phase, setPhase] = useState<Phase>('intro')
  const [optionsOpen, setOptionsOpen] = useState(false)
  const [hud, setHud] = useState({ score: 0, streak: 0, level: 1, into: 0, goal: 50, timeLeft: BLAST_ROUND_MS, prompt: '', promptPct: 1 })
  const [paused, setPaused] = useState(false)
  const [result, setResult] = useState<{ best: number; isNewBest: boolean } | null>(null)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const game = useRef<Game | null>(null)
  const rng = useRef(mulberry32(1))
  const nextCard = useRef<() => Card>(() => cards[0])
  const sizeRef = useRef({ w: 360, h: 600, dpr: 1 })
  const playRef = useRef(play)
  playRef.current = play
  const sfx = (n: SfxName) => playRef.current(n)

  const newRound = useCallback(
    (g: Game) => {
      const card = nextCard.current()
      g.round = makeBlastRound(cards, card, rng.current, opts.promptSide, g.level)
      g.asteroids = spawnAsteroids(g.round.options, g.round.correct, sizeRef.current.w, rng.current, g.nextId, g.level)
      g.nextId += g.asteroids.length
      g.promptLeft = BLAST_PROMPT_MS
      g.askedAt = performance.now()
    },
    [cards, opts.promptSide],
  )

  const start = useCallback(() => {
    rng.current = mulberry32(Date.now() & 0xfffff)
    nextCard.current = cardCycler(cards, rng.current)
    const { w, h } = sizeRef.current
    const g: Game = {
      score: 0, streak: 0, bestStreak: 0, hits: 0, misses: 0, level: 1,
      roundLeft: BLAST_ROUND_MS, promptLeft: BLAST_PROMPT_MS, round: null, asteroids: [],
      shipAngle: -Math.PI / 2, shipTarget: -Math.PI / 2, laser: null, particles: [], flash: 0, nextId: 1, nextRoundIn: 0, over: false, askedAt: 0,
      stars: Array.from({ length: 60 }, () => ({ x: Math.random() * w, y: Math.random() * h, r: Math.random() * 1.5 + 0.3 })),
    }
    newRound(g)
    game.current = g
    setResult(null)
    setPaused(false)
    setPhase('play')
    void session.begin({ starredOnly: opts.starredOnly, promptSide: opts.promptSide, ship: opts.ship })
  }, [cards, newRound, opts.promptSide, opts.ship, opts.starredOnly, session])

  const finish = useCallback(() => {
    const g = game.current
    if (!g || g.over) return
    g.over = true
    sfx(g.score > 0 ? 'win' : 'lose')
    void session.end(g.score, g.hits + g.misses).then((r) => {
      setResult(r)
      setPhase('end')
    })
  }, [session])

  const miss = useCallback((g: Game, given: string) => {
    if (!g.round) return
    g.misses++
    g.streak = 0
    g.flash = 1
    sfx('wrong')
    session.answer(g.round.card, false, given, g.round.correct, opts.promptSide, Math.round(performance.now() - g.askedAt))
    g.nextRoundIn = 500
    for (const a of g.asteroids) a.alive = false
  }, [opts.promptSide, session])

  const shoot = useCallback(
    (a: Asteroid) => {
      const g = game.current
      if (!g || !g.round || g.over || g.nextRoundIn > 0) return
      const { w, h } = sizeRef.current
      const shipX = w / 2
      const shipY = h - 40
      g.shipTarget = Math.atan2(a.y - shipY, a.x - shipX)
      g.laser = { x: a.x, y: a.y, t: 1 }
      if (a.correct) {
        const pts = blastPoints(g.streak)
        g.streak++
        g.bestStreak = Math.max(g.bestStreak, g.streak)
        g.hits++
        const before = levelState(g.score).level
        g.score += pts
        const lv = levelState(g.score)
        if (lv.level > before) {
          g.level = lv.level
          sfx('levelUp')
        }
        sfx('laser')
        window.setTimeout(() => sfx('explode'), 80)
        for (let i = 0; i < 22; i++) {
          const ang = Math.random() * Math.PI * 2
          const sp = 40 + Math.random() * 160
          g.particles.push({ x: a.x, y: a.y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, life: 0.7 + Math.random() * 0.4, color: ['#f472b6', '#facc15', '#a78bfa', '#fff'][i % 4] })
        }
        a.alive = false
        session.answer(g.round.card, true, a.text, g.round.correct, opts.promptSide, Math.round(performance.now() - g.askedAt))
        g.nextRoundIn = 450
        for (const o of g.asteroids) o.alive = false
      } else {
        a.alive = false
        miss(g, a.text)
      }
    },
    [miss, opts.promptSide, session],
  )

  // canvas sizing
  useEffect(() => {
    if (phase !== 'play') return
    const wrap = wrapRef.current
    const canvas = canvasRef.current
    if (!wrap || !canvas) return
    const resize = () => {
      const rect = wrap.getBoundingClientRect()
      const dpr = Math.min(3, window.devicePixelRatio || 1)
      const w = Math.max(320, rect.width)
      const h = Math.max(400, rect.height)
      sizeRef.current = { w, h, dpr }
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(wrap)
    return () => ro.disconnect()
  }, [phase])

  // pause on hidden tab
  useEffect(() => {
    const on = () => setPaused(document.visibilityState === 'hidden')
    document.addEventListener('visibilitychange', on)
    return () => document.removeEventListener('visibilitychange', on)
  }, [])

  // main loop
  useEffect(() => {
    if (phase !== 'play') return
    let raf = 0
    let last = performance.now()
    let hudAcc = 0
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop)
      const g = game.current
      const canvas = canvasRef.current
      if (!g || !canvas) return
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      if (paused || g.over) {
        draw(canvas, g, sizeRef.current, opts.ship, g.round?.prompt ?? '')
        return
      }
      // update
      g.roundLeft -= dt * 1000
      if (g.roundLeft <= 0) {
        g.roundLeft = 0
        finish()
        return
      }
      if (g.nextRoundIn > 0) {
        g.nextRoundIn -= dt * 1000
        if (g.nextRoundIn <= 0) {
          g.nextRoundIn = 0
          newRound(g)
        }
      } else {
        g.promptLeft -= dt * 1000
        stepAsteroids(g.asteroids, dt, sizeRef.current.w)
        const correctEscaped = g.asteroids.some((a) => a.alive && a.correct && a.y - a.r > sizeRef.current.h)
        if (g.promptLeft <= 0 || correctEscaped || anyEscaped(g.asteroids, sizeRef.current.h + 200)) miss(g, '')
      }
      // ship rotation easing
      let d = g.shipTarget - g.shipAngle
      while (d > Math.PI) d -= Math.PI * 2
      while (d < -Math.PI) d += Math.PI * 2
      g.shipAngle += d * Math.min(1, dt * 14)
      if (g.laser) {
        g.laser.t -= dt * 4
        if (g.laser.t <= 0) {
          g.laser = null
          g.shipTarget = -Math.PI / 2
        }
      }
      for (const p of g.particles) {
        p.x += p.vx * dt
        p.y += p.vy * dt
        p.vy += 120 * dt
        p.life -= dt
      }
      g.particles = g.particles.filter((p) => p.life > 0)
      g.flash = Math.max(0, g.flash - dt * 3)
      // hud ~10/s
      hudAcc += dt
      if (hudAcc > 0.1) {
        hudAcc = 0
        const lv = levelState(g.score)
        setHud({ score: g.score, streak: g.streak, level: lv.level, into: lv.into, goal: lv.goal, timeLeft: g.roundLeft, prompt: g.round?.prompt ?? '', promptPct: Math.max(0, g.promptLeft / BLAST_PROMPT_MS) })
      }
      draw(canvas, g, sizeRef.current, opts.ship, g.round?.prompt ?? '')
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [phase, paused, opts.ship, finish, miss, newRound])

  const onPointer = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const g = game.current
    if (!g || paused) return
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const a = hitAsteroid(g.asteroids, x, y)
    if (a) shoot(a)
  }

  useKeydown((e) => {
    const g = game.current
    if (!g || paused) return
    const n = Number(e.key)
    if (n >= 1 && n <= 5) {
      const alive = g.asteroids.filter((a) => a.alive).sort((a, b) => a.x - b.x)
      if (alive[n - 1]) shoot(alive[n - 1])
    }
  }, phase === 'play')

  const meta = gameMeta('blast')
  const enough = cards.length >= meta.minCards
  const secs = Math.ceil(hud.timeLeft / 1000)

  return (
    <GameLayout header={<GameHeader setId={setId} game="blast" center={phase === 'play' ? <span className="text-lg tabular-nums">{t('games:common.seconds', { value: secs })}</span> : set?.title} onOptions={phase === 'intro' ? () => setOptionsOpen(true) : undefined} />}>
      <GameStatus loading={loading} found={!!set} />
      {!loading && set && phase === 'intro' && (
        <GameIntro game="blast" onPlay={start} options={opts} onOptions={setOpts} disabled={!enough} disabledReason={t('games:common.notEnoughCards', { count: meta.minCards })} optionsOpen={optionsOpen} onOptionsOpenChange={setOptionsOpen}>
          <div className="mb-5 flex items-center gap-4" role="group" aria-label={t('games:blast.chooseShip')}>
            <button className="rounded-full p-2 hover:bg-surface-2" aria-label={t('games:blast.prevShip')} onClick={() => setOpts({ ship: (opts.ship + SHIPS.length - 1) % SHIPS.length })}>
              <ChevronLeft />
            </button>
            <div className="grid h-20 w-20 place-items-center rounded-full bg-gradient-green text-4xl shadow-pop">
              <span aria-hidden>{SHIPS[opts.ship % SHIPS.length]}</span>
            </div>
            <button className="rounded-full p-2 hover:bg-surface-2" aria-label={t('games:blast.nextShip')} onClick={() => setOpts({ ship: (opts.ship + 1) % SHIPS.length })}>
              <ChevronRight />
            </button>
          </div>
        </GameIntro>
      )}
      {phase === 'play' && (
        <div ref={wrapRef} className="relative flex-1 touch-none select-none overflow-hidden bg-[#1e1b4b]">
          <canvas ref={canvasRef} className="block cursor-crosshair" onPointerDown={onPointer} aria-label="Blast" />
          {/* DOM HUD */}
          <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-col">
            <div className="flex items-center justify-between px-4 py-2 text-sm font-bold text-white">
              <span className="tabular-nums">{hud.score}</span>
              <span className="flex items-center gap-1 text-xs text-yellow-300"><Trophy size={14} /> {formatBest('blast', best)}</span>
            </div>
          </div>
          <div className="pointer-events-none absolute bottom-3 left-4 w-40 text-white">
            <div className="flex justify-between text-sm font-bold text-yellow-300">
              <span>{t('games:blast.lvl', { level: hud.level })}</span>
              <span className="tabular-nums">{hud.into}/{hud.goal}</span>
            </div>
            <div className="mt-1 h-2 rounded-full bg-white/20">
              <div className="h-2 rounded-full bg-yellow-300 transition-[width]" style={{ width: `${(hud.into / hud.goal) * 100}%` }} />
            </div>
          </div>
          <div className="pointer-events-none absolute bottom-3 right-4 w-40 text-right text-white">
            <div className="text-sm font-bold text-fuchsia-300">{t('games:common.streak')}</div>
            <div className="mt-1 flex gap-0.5" aria-label={`${t('games:common.streak')} ${hud.streak}`}>
              {Array.from({ length: BLAST_STREAK_SEGMENTS }).map((_, i) => (
                <div key={i} className={`h-2 flex-1 rounded-sm ${i < Math.min(hud.streak, BLAST_STREAK_SEGMENTS) ? 'bg-fuchsia-400' : 'bg-white/20'}`} />
              ))}
            </div>
          </div>
          {paused && <PausedOverlay label={t('games:common.paused')} onResume={() => setPaused(false)} />}
        </div>
      )}
      {phase === 'end' && result && game.current && (
        <GameEnd setId={setId} title={result.isNewBest ? t('games:common.newBest') : t('games:blast.timeUp')} scoreLabel={t('games:common.score')} score={game.current.score} best={formatBest('blast', result.best)} isNewBest={result.isNewBest} onPlayAgain={start}>
          <div className="flex flex-wrap justify-center gap-2 text-sm text-muted">
            <span className="rounded-full bg-surface-2 px-3 py-1">{t('games:blast.hits', { count: game.current.hits })}</span>
            <span className="rounded-full bg-surface-2 px-3 py-1">{t('games:blast.misses', { count: game.current.misses })}</span>
            <span className="rounded-full bg-surface-2 px-3 py-1">{t('games:blast.bestStreak', { count: game.current.bestStreak })}</span>
          </div>
        </GameEnd>
      )}
    </GameLayout>
  )
}

// ---------- drawing ----------
function wrapText(ctx: CanvasRenderingContext2D, text: string, maxW: number, maxLines: number): string[] {
  const words = text.split(' ')
  const lines: string[] = []
  let cur = ''
  for (const w of words) {
    const test = cur ? `${cur} ${w}` : w
    if (ctx.measureText(test).width > maxW && cur) {
      lines.push(cur)
      cur = w
    } else cur = test
  }
  if (cur) lines.push(cur)
  if (lines.length > maxLines) {
    const cut = lines.slice(0, maxLines)
    cut[maxLines - 1] = `${cut[maxLines - 1].slice(0, -1)}…`
    return cut
  }
  return lines
}

function draw(canvas: HTMLCanvasElement, g: Game, size: { w: number; h: number; dpr: number }, ship: number, prompt: string) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const { w, h, dpr } = size
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  // background
  const grad = ctx.createLinearGradient(0, 0, 0, h)
  grad.addColorStop(0, '#1e1b4b')
  grad.addColorStop(1, '#0f0c3a')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, w, h)
  ctx.fillStyle = 'rgba(255,255,255,0.7)'
  for (const s of g.stars) {
    ctx.beginPath()
    ctx.arc(s.x % w, s.y % h, s.r, 0, Math.PI * 2)
    ctx.fill()
  }
  // prompt band
  const bandH = 96
  ctx.fillStyle = '#312e81'
  ctx.fillRect(0, 0, w, bandH)
  ctx.fillStyle = '#fff'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = `600 ${w < 480 ? 15 : 18}px Inter, system-ui, sans-serif`
  const lines = wrapText(ctx, prompt, w - 32, 3)
  const lh = w < 480 ? 19 : 23
  lines.forEach((l, i) => ctx.fillText(l, w / 2, 32 + bandH / 2 - ((lines.length - 1) * lh) / 2 + i * lh - 16))
  // prompt timer bar
  ctx.fillStyle = 'rgba(255,255,255,0.15)'
  ctx.fillRect(0, bandH, w, 6)
  const pct = Math.max(0, g.promptLeft / BLAST_PROMPT_MS)
  ctx.fillStyle = pct > 0.35 ? '#a78bfa' : '#f87171'
  ctx.fillRect(0, bandH, w * pct, 6)
  // asteroids
  for (const a of g.asteroids) {
    if (!a.alive) continue
    ctx.save()
    ctx.translate(a.x, a.y)
    ctx.rotate(a.rot)
    ctx.fillStyle = PALETTE[a.id % PALETTE.length]
    ctx.beginPath()
    for (let i = 0; i < 9; i++) {
      const ang = (i / 9) * Math.PI * 2
      const rr = a.r * (0.88 + 0.12 * Math.sin(i * 2.3 + a.id))
      if (i === 0) ctx.moveTo(Math.cos(ang) * rr, Math.sin(ang) * rr)
      else ctx.lineTo(Math.cos(ang) * rr, Math.sin(ang) * rr)
    }
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = 'rgba(0,0,0,0.18)'
    ctx.beginPath()
    ctx.arc(-a.r * 0.35, -a.r * 0.3, a.r * 0.18, 0, Math.PI * 2)
    ctx.arc(a.r * 0.3, a.r * 0.35, a.r * 0.12, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
    // text (not rotated)
    ctx.fillStyle = '#fff'
    ctx.font = `600 ${a.r > 48 ? 14 : 12}px Inter, system-ui, sans-serif`
    const tl = wrapText(ctx, a.text, a.r * 1.7, 3)
    tl.forEach((l, i) => ctx.fillText(l, a.x, a.y - ((tl.length - 1) * 15) / 2 + i * 15))
  }
  // particles
  for (const p of g.particles) {
    ctx.globalAlpha = Math.max(0, Math.min(1, p.life))
    ctx.fillStyle = p.color
    ctx.fillRect(p.x - 2, p.y - 2, 4, 4)
  }
  ctx.globalAlpha = 1
  // ship
  const sx = w / 2
  const sy = h - 40
  if (g.laser) {
    ctx.strokeStyle = `rgba(244,114,182,${g.laser.t})`
    ctx.lineWidth = 4
    ctx.beginPath()
    ctx.moveTo(sx, sy - 20)
    ctx.lineTo(g.laser.x, g.laser.y)
    ctx.stroke()
  }
  ctx.save()
  ctx.translate(sx, sy)
  ctx.rotate(g.shipAngle + Math.PI / 2)
  ctx.fillStyle = '#34d399'
  ctx.beginPath()
  ctx.arc(0, 0, 34, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#064e3b'
  ctx.fillRect(-6, -46, 12, 14)
  ctx.rotate(-(g.shipAngle + Math.PI / 2))
  ctx.font = '30px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif'
  ctx.fillText(SHIPS[ship % SHIPS.length], 0, 2)
  ctx.restore()
  // wrong flash
  if (g.flash > 0) {
    ctx.fillStyle = `rgba(239,68,68,${g.flash * 0.35})`
    ctx.fillRect(0, 0, w, h)
  }
}
