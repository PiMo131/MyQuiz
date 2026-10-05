import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useParams } from 'react-router'
import { ChevronLeft } from 'lucide-react'
import type { LiveMode } from '@/domain/live/protocol'
import { Button, EmptyState, cn } from '@/ui'
import { useLiveHost } from './useLiveHost'
import { useSound } from './components/useSound'
import { LiveHeader } from './components/LiveHeader'
import { OptionsModal } from './components/OptionsModal'
import { ConnectionBadge } from './components/ConnectionBadge'
import { TypePicker } from './host/TypePicker'
import { HostLobby } from './host/HostLobby'
import { HostGame } from './host/HostGame'
import { HostResults } from './host/HostResults'
import { PlayerGame } from './player/PlayerGame'
import { PlayerResults } from './player/PlayerResults'

const MIN_CARDS = 4

export default function HostPage() {
  const { setId = '' } = useParams()
  const { t } = useTranslation('live')
  const navigate = useNavigate()
  const host = useLiveHost(setId)
  const sound = useSound()
  const [typeChosen, setTypeChosen] = useState(false)
  const [options, setOptions] = useState(false)
  const [myPanel, setMyPanel] = useState(true)
  const { view, state } = host

  useEffect(() => {
    if (state.phase === 'playing' && state.startedAt && Date.now() - state.startedAt < 600) sound.play('go')
    if (state.phase === 'results') sound.play('finish')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase])
  const playerCount = view.players.length
  useEffect(() => {
    if (state.phase === 'lobby' && playerCount > 0) sound.play('join')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerCount])

  const close = () => navigate(`/set/${setId}`)

  if (host.set === null || (host.set === undefined && host.cards !== undefined)) {
    return (
      <div className="mx-auto max-w-xl p-8">
        <EmptyState title={t('host.notFound')} action={<Link to="/live"><Button variant="secondary">{t('results.newSet')}</Button></Link>} />
      </div>
    )
  }
  if (!host.set || !host.cards) {
    return (
      <div className="grid min-h-dvh place-items-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    )
  }
  if (state.cards.length < MIN_CARDS && host.cards !== undefined) {
    return (
      <div className="mx-auto max-w-xl p-8">
        <EmptyState title={t('host.tooFewCards', { count: MIN_CARDS })} action={<Button variant="secondary" onClick={close}>{t('results.backToSet')}</Button>} />
      </div>
    )
  }

  const pickType = (mode: LiveMode) => {
    host.configure({ mode })
    setTypeChosen(true)
  }
  const relay = host.room.status === 'open' ? (host.room.relayOpen ? 'connected' : 'connecting') : host.room.status === 'error' ? 'offline' : 'connecting'
  const inLobby = state.phase === 'lobby'
  const inGame = state.phase === 'countdown' || state.phase === 'playing'
  const showMyPanel = state.config.hostPlays && host.myView && (inGame || state.phase === 'results')

  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <LiveHeader
        left={
          inLobby && typeChosen ? (
            <button className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-sm font-semibold text-muted hover:bg-surface-2" onClick={() => setTypeChosen(false)}>
              <ChevronLeft size={16} /> {t(`modes.${state.config.mode}.name`)}
            </button>
          ) : (
            <span className="truncate px-2 text-sm font-semibold text-muted">{inLobby ? t('title') : t(`modes.${state.config.mode}.name`)}</span>
          )
        }
        title={host.set.title}
        subtitle={inGame ? `${t('host.code')} ${host.code.slice(0, 3)}-${host.code.slice(3)}` : undefined}
        soundOn={sound.on}
        onToggleSound={sound.toggle}
        onOptions={inLobby ? () => setOptions(true) : undefined}
        onClose={close}
        right={!inLobby ? <ConnectionBadge state={relay} peers={host.room.peers.length} /> : undefined}
      />

      <main className={cn('relative flex flex-1 flex-col', showMyPanel && 'lg:flex-row')}>
        <div className="flex flex-1 flex-col">
          {inLobby && !typeChosen && <TypePicker config={state.config} onPick={pickType} />}
          {inLobby && typeChosen && (
            <HostLobby
              code={host.code}
              view={view}
              room={host.room}
              myId={host.myId}
              onStart={host.start}
              onOptions={() => setOptions(true)}
              onKick={host.kick}
              onNewCode={host.newCode}
              onConfigure={host.configure}
            />
          )}
          {inGame && <HostGame view={view} onEnd={() => window.confirm(t('host.endConfirm')) && host.end()} onNextRound={host.nextRound} />}
          {state.phase === 'results' && (
            <HostResults
              view={view}
              setId={setId}
              onPlayAgain={() => {
                host.reset()
              }}
              onExport={host.exportResults}
            />
          )}
        </div>
        {showMyPanel && host.myView && (
          <aside className={cn('border-t border-border bg-surface lg:w-96 lg:border-l lg:border-t-0', !myPanel && 'lg:w-12')}>
            <button className="flex w-full items-center justify-between px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted hover:bg-surface-2" onClick={() => setMyPanel((v) => !v)} aria-expanded={myPanel}>
              <span className={cn(!myPanel && 'lg:hidden')}>{t('host.yourTurn')}</span>
              <span>{myPanel ? '–' : '+'}</span>
            </button>
            {myPanel && (
              <div className="flex flex-col p-4">
                {state.phase === 'results' ? (
                  <PlayerResults view={host.myView} setCode={null} embedded />
                ) : (
                  <PlayerGame view={host.myView} onAnswer={host.answer} onPower={host.power} onMatch={host.match} embedded />
                )}
              </div>
            )}
          </aside>
        )}
      </main>

      <OptionsModal open={options} onClose={() => setOptions(false)} config={state.config} onSave={host.configure} soundOn={sound.on} onToggleSound={sound.toggle} />
    </div>
  )
}
