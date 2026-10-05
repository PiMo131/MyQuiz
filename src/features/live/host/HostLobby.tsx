import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link2, Play, RefreshCw, Settings2, UserX } from 'lucide-react'
import { inviteUrl, type LiveConfig, type PublicState } from '@/domain/live/protocol'
import { Button, Toggle, toast } from '@/ui'
import { Avatar } from '../components/Avatar'
import { CodeBadge } from '../components/CodeBadge'
import { QrCode } from '../components/QrCode'
import { ConnectionBadge } from '../components/ConnectionBadge'
import type { UseLiveRoom } from '../useLiveRoom'
import { RelayPicker } from '../components/RelayPicker'

export interface HostLobbyProps {
  code: string
  view: PublicState
  room: UseLiveRoom
  myId: string
  onStart: () => void
  onOptions: () => void
  onKick: (id: string) => void
  onNewCode: () => void
  onConfigure: (c: Partial<LiveConfig>) => void
}

export function HostLobby({ code, view, room, myId, onStart, onOptions, onKick, onNewCode, onConfigure }: HostLobbyProps) {
  const { t } = useTranslation('live')
  const [hidden, setHidden] = useState(false)
  const url = inviteUrl(code)
  const players = view.players
  const remote = players.filter((p) => p.id !== myId)
  const canStart = players.some((p) => p.connected)
  const relay = room.status === 'open' ? (room.relayOpen ? 'connected' : 'connecting') : room.status === 'error' ? 'offline' : 'connecting'

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      toast.success(t('host.linkCopied'))
    } catch {
      window.prompt(t('host.copyLink'), url)
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-6">
      <div className="grid gap-4 lg:grid-cols-[1fr_auto]">
        <div className="card flex flex-col justify-between gap-4 bg-gradient-indigo p-6 text-white sm:p-8">
          <div>
            <div className="text-sm font-semibold uppercase tracking-wide opacity-80">{t('host.lobbyTitle')}</div>
            <div className="truncate text-lg font-bold sm:text-2xl">{url.replace(/^https?:\/\//, '')}</div>
          </div>
          <div className="[&_button]:bg-white/20 [&_button]:text-white">
            <CodeBadge code={code} hidden={hidden} onToggle={() => setHidden((h) => !h)} />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" leftIcon={<Link2 size={16} />} onClick={() => void copy()} className="bg-white text-primary hover:bg-white/90">
              {t('host.copyLink')}
            </Button>
            <Button variant="ghost" leftIcon={<RefreshCw size={16} />} onClick={onNewCode} className="text-white hover:bg-white/15" disabled={players.length > 0}>
              {t('host.newCode')}
            </Button>
          </div>
        </div>
        <div className="flex justify-center lg:justify-end">
          <QrCode value={url} size={220} className={hidden ? 'blur-md' : ''} />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="relative flex h-3 w-3">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-75" />
            <span className="relative inline-flex h-3 w-3 rounded-full bg-accent" />
          </span>
          <h2 className="text-lg font-bold sm:text-2xl">{remote.length ? t('host.playersJoined', { count: remote.length }) : t('host.waitingPlayers')}</h2>
        </div>
        <div className="flex items-center gap-2">
          <ConnectionBadge state={relay} peers={room.peers.length} />
          <Button variant="secondary" leftIcon={<Settings2 size={16} />} onClick={onOptions}>
            {t('host.options')}
          </Button>
        </div>
      </div>

      {relay === 'offline' || (room.status === 'open' && !room.relayOpen && room.peers.length === 0) ? (
        <div className="card flex flex-col gap-3 border-highlight/50 bg-highlight-soft p-4 text-sm sm:flex-row sm:items-end">
          <p className="flex-1">{room.status === 'open' && !room.relayOpen ? t('host.connecting') : t('host.relayDown')}</p>
          <div className="w-full sm:w-64">
            <RelayPicker value={room.strategy} onChange={room.setStrategy} />
          </div>
        </div>
      ) : null}

      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5" aria-live="polite">
        {players.map((p) => (
          <li key={p.id} className="card group relative flex items-center gap-3 p-3 animate-pop">
            <Avatar emoji={p.avatar} />
            <span className="min-w-0 flex-1 truncate font-semibold">{p.name}</span>
            {p.id !== myId && (
              <button
                onClick={() => onKick(p.id)}
                className="hidden rounded-full p-1 text-muted hover:bg-error-soft hover:text-error group-hover:block focus-visible:block"
                aria-label={t('host.kick', { name: p.name })}
              >
                <UserX size={16} />
              </button>
            )}
          </li>
        ))}
      </ul>

      <div className="mt-auto flex flex-col items-center gap-3 pb-4">
        <Toggle checked={view.config.hostPlays} onChange={(v) => onConfigure({ hostPlays: v })} label={t('host.playAlong')} description={t('host.playAlongHint')} />
        <Button size="lg" variant="gradient" leftIcon={<Play size={18} />} disabled={!canStart} onClick={onStart} className="min-w-64 text-lg">
          {t('host.start')}
        </Button>
        {!canStart && <p className="text-sm text-muted">{t('host.startHint')}</p>}
      </div>
    </div>
  )
}
