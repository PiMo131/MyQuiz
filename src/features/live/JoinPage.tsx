import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useParams } from 'react-router'
import { LogIn } from 'lucide-react'
import { codeFromText, formatCode, isValidCode, normalizeCode, type PlayerIdentity } from '@/domain/live/protocol'
import { useSettings } from '@/app/settings-store'
import { Button, Input, Label, cn } from '@/ui'
import { useLivePlayer } from './useLivePlayer'
import { useSound } from './components/useSound'
import { LiveHeader } from './components/LiveHeader'
import { Avatar, AvatarPicker } from './components/Avatar'
import { ConnectionBadge } from './components/ConnectionBadge'
import { RelayPicker } from './components/RelayPicker'
import { Leaderboard } from './components/Leaderboard'
import { PlayerGame } from './player/PlayerGame'
import { PlayerResults } from './player/PlayerResults'
import { loadIdentity, saveIdentity } from './storage'

export default function JoinPage() {
  const { code: codeParam } = useParams()
  const { t } = useTranslation('live')
  const navigate = useNavigate()
  const settings = useSettings((s) => s.settings)
  const sound = useSound()
  const [codeInput, setCodeInput] = useState(() => normalizeCode(codeParam ?? ''))
  const [identity, setIdentity] = useState<PlayerIdentity>(() => loadIdentity({ name: settings.displayName, avatar: settings.avatar }))
  const [joined, setJoined] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (codeParam) setCodeInput(normalizeCode(codeParam))
  }, [codeParam])

  const code = joined && isValidCode(codeInput) ? codeInput : null
  const player = useLivePlayer(code, joined ? identity : null)
  const { view } = player

  useEffect(() => {
    if (view?.phase === 'results') sound.play('finish')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view?.phase])

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const c = codeFromText(codeInput)
    if (!isValidCode(c)) {
      setError(t('home.invalidCode'))
      return
    }
    const id = { ...identity, name: identity.name.trim() || 'Player' }
    setIdentity(id)
    saveIdentity(id)
    setCodeInput(c)
    setError(null)
    setJoined(true)
    if (codeParam !== c) navigate(`/live/join/${c}`, { replace: true })
  }

  const leave = () => {
    setJoined(false)
    navigate('/live')
  }

  const relayState = player.room.status === 'open' ? (player.status === 'connected' ? 'connected' : 'connecting') : player.room.status === 'error' ? 'offline' : 'connecting'
  const title = useMemo(() => (player.setTitle ? player.setTitle : code ? formatCode(code) : t('join.title')), [player.setTitle, code, t])

  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <LiveHeader
        left={<span className="truncate px-2 text-sm font-semibold text-muted">{view ? t(`modes.${view.config.mode}.name`) : t('title')}</span>}
        title={title}
        subtitle={view && code ? formatCode(code) : undefined}
        soundOn={sound.on}
        onToggleSound={sound.toggle}
        onClose={leave}
        right={joined ? <ConnectionBadge state={relayState} /> : undefined}
      />
      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col px-4 py-4 safe-bottom">
        {!joined && (
          <form onSubmit={submit} className="card flex flex-col gap-5 p-5 animate-pop">
            <h1 className="text-2xl font-black">{t('join.title')}</h1>
            {!player.room.webRtcSupported && <p className="rounded-xl bg-error-soft p-3 text-sm text-error">{t('join.noWebRtc')}</p>}
            <div>
              <Label htmlFor="join-code">{t('join.code')}</Label>
              <Input
                id="join-code"
                value={formatCode(codeInput)}
                onChange={(e) => setCodeInput(codeFromText(e.target.value))}
                placeholder={t('home.codePlaceholder')}
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
                inputMode="text"
                className="text-center font-mono text-2xl font-black tracking-[0.3em] uppercase"
                aria-invalid={Boolean(error)}
              />
              {error && <p className="mt-1 text-sm text-error">{error}</p>}
            </div>
            <div>
              <Label htmlFor="join-name">{t('join.name')}</Label>
              <div className="flex items-center gap-3">
                <Avatar emoji={identity.avatar} />
                <Input id="join-name" value={identity.name} maxLength={24} onChange={(e) => setIdentity({ ...identity, name: e.target.value })} placeholder={t('join.namePlaceholder')} required />
              </div>
            </div>
            <div>
              <Label>{t('join.avatar')}</Label>
              <AvatarPicker value={identity.avatar} onChange={(avatar) => setIdentity({ ...identity, avatar })} label={t('join.avatar')} />
            </div>
            <Button type="submit" size="lg" variant="gradient" leftIcon={<LogIn size={18} />} full disabled={!player.room.webRtcSupported}>
              {t('join.join')}
            </Button>
          </form>
        )}

        {joined && (player.status === 'connecting' || player.status === 'idle') && (
          <div className="grid flex-1 place-items-center text-center">
            <div className="flex flex-col items-center gap-4">
              <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent" />
              <div className="text-lg font-bold">{t('join.connecting')}</div>
              <p className="max-w-xs text-sm text-muted">{t('join.connectingHint')}</p>
              <Button variant="ghost" onClick={leave}>
                {t('join.leave')}
              </Button>
            </div>
          </div>
        )}

        {joined && player.status === 'timeout' && (
          <div className="card flex flex-col gap-4 p-5">
            <h2 className="text-xl font-bold">{t('join.timeoutTitle')}</h2>
            <p className="text-sm text-muted">{t('join.timeoutBody')}</p>
            <RelayPicker value={player.room.strategy} onChange={player.room.setStrategy} />
            <div className="flex flex-wrap gap-2">
              <Button onClick={player.retry}>{t('join.retry')}</Button>
              <Button variant="secondary" onClick={() => setJoined(false)}>
                {t('join.code')}
              </Button>
            </div>
            <p className="rounded-xl bg-surface-2 p-3 text-xs text-muted">{t('join.shareInstead')}</p>
          </div>
        )}

        {joined && player.status === 'ended' && view?.phase !== 'results' && (
          <div className="grid flex-1 place-items-center text-center">
            <div className="flex flex-col items-center gap-4">
              <div className="text-5xl">👋</div>
              <p className="text-lg font-bold">
                {player.endReason === 'kicked'
                  ? t('join.endedKicked')
                  : player.endReason === 'full'
                    ? t('join.endedFull')
                    : player.endReason === 'version'
                      ? t('join.endedVersion')
                      : t('join.endedHostLeft')}
              </p>
              {view && view.leaderboard.length > 0 && <Leaderboard entries={view.leaderboard} highlight={view.me?.id} compact className="w-72 text-left" />}
              <div className="flex gap-2">
                <Button onClick={player.retry} variant="secondary">
                  {t('join.retry')}
                </Button>
                <Link to="/">
                  <Button>{t('results.home')}</Button>
                </Link>
              </div>
            </div>
          </div>
        )}

        {joined && view && (player.status === 'connected' || view.phase === 'results') && (
          <>
            {view.phase === 'lobby' && (
              <div className="flex flex-1 flex-col items-center gap-6 pt-8 text-center">
                <Avatar emoji={identity.avatar} size="xl" className="animate-pop" />
                <div>
                  <div className="text-2xl font-black">{t('join.youAreIn')}</div>
                  <div className="font-semibold">{identity.name}</div>
                  <p className={cn('mt-3 text-muted', 'animate-pulse')}>{t('join.waiting')}</p>
                </div>
                <div className="w-full">
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">{t('join.players', { count: view.leaderboard.length })}</div>
                  <ul className="flex flex-wrap justify-center gap-2">
                    {view.leaderboard.map((p) => (
                      <li key={p.id} className="flex items-center gap-1.5 rounded-full bg-surface px-2 py-1 text-sm shadow-card">
                        <span aria-hidden="true">{p.avatar}</span> {p.name}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
            {(view.phase === 'countdown' || view.phase === 'playing') && (
              <PlayerGame view={view} offset={player.clockOffset} onAnswer={player.answer} onPower={player.power} onMatch={player.match} play={sound.play} />
            )}
            {view.phase === 'results' && <PlayerResults view={view} setCode={player.setCode} />}
          </>
        )}
      </main>
    </div>
  )
}
