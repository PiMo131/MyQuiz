import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { Download, RotateCcw, Shuffle } from 'lucide-react'
import type { PublicState } from '@/domain/live/protocol'
import { Button } from '@/ui'
import { Leaderboard, TeamBoard } from '../components/Leaderboard'
import { Podium } from '../components/Podium'

export function HostResults({ view, setId, onPlayAgain, onExport }: { view: PublicState; setId: string; onPlayAgain: () => void; onExport: () => void }) {
  const { t } = useTranslation('live')
  const teams = view.teams.map((s) => s.team)
  const winners = view.players.filter((p) => view.winners.includes(p.id))
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-4 py-8">
      <div className="text-center">
        <div className="text-sm font-semibold uppercase tracking-wide text-muted">{t('results.title')}</div>
        <h1 className="mt-1 text-3xl font-black sm:text-5xl">
          {winners.length > 1 ? t('results.winners') : t('results.winner')}: {winners.map((w) => w.name).join(', ') || view.players[0]?.name}
        </h1>
      </div>
      <Podium entries={view.players} teams={teams} />
      <div className="grid gap-6 lg:grid-cols-2">
        <section>
          <h2 className="mb-2 text-lg font-bold">{t('results.ranking')}</h2>
          {view.teams.length > 0 && <TeamBoard teams={view.teams} className="mb-3" />}
          <Leaderboard entries={view.players} teams={teams} />
        </section>
        <section>
          <h2 className="mb-2 text-lg font-bold">{t('results.mostMissed')}</h2>
          {view.missed.length === 0 ? (
            <p className="rounded-xl bg-surface-2 p-4 text-sm text-muted">{t('results.noMissed')}</p>
          ) : (
            <ol className="space-y-1.5">
              {view.missed.map((m) => (
                <li key={m.id} className="card flex items-center gap-3 p-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold">{m.term}</div>
                    <div className="truncate text-sm text-muted">{m.definition}</div>
                  </div>
                  <span className="shrink-0 rounded-full bg-error-soft px-2.5 py-0.5 text-xs font-semibold text-error">{t('results.missedCount', { count: m.count })}</span>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
      <div className="flex flex-wrap justify-center gap-3 pb-6">
        <Button size="lg" variant="gradient" leftIcon={<RotateCcw size={18} />} onClick={onPlayAgain}>
          {t('results.playAgain')}
        </Button>
        <Link to="/live">
          <Button size="lg" variant="secondary" leftIcon={<Shuffle size={18} />}>
            {t('results.newSet')}
          </Button>
        </Link>
        <Button size="lg" variant="outline" leftIcon={<Download size={18} />} onClick={onExport}>
          {t('results.export')}
        </Button>
        <Link to={`/set/${setId}`}>
          <Button size="lg" variant="ghost">
            {t('results.backToSet')}
          </Button>
        </Link>
      </div>
    </div>
  )
}
