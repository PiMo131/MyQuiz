import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { BookmarkPlus, Home } from 'lucide-react'
import type { PlayerView } from '@/domain/live/protocol'
import { Button } from '@/ui'
import { Leaderboard } from '../components/Leaderboard'
import { Podium } from '../components/Podium'

export function PlayerResults({ view, setCode, embedded }: { view: PlayerView; setCode: string | null; embedded?: boolean }) {
  const { t } = useTranslation('live')
  const me = view.me
  const teams = view.teams.map((s) => s.team)
  const isWinner = me ? view.winners.includes(me.id) : false
  return (
    <div className="flex flex-1 flex-col gap-5">
      {me && (
        <div className="text-center">
          <div className="text-5xl">{isWinner ? '🏆' : view.rank <= 3 ? '🎉' : '👏'}</div>
          <h1 className="mt-2 text-2xl font-black">{t('results.yourRank', { rank: view.rank })}</h1>
          <p className="text-muted">{t('results.yourScore', { score: me.score })}</p>
        </div>
      )}
      <Podium entries={view.leaderboard} teams={teams} confetti={isWinner && !embedded} />
      <Leaderboard entries={view.leaderboard} teams={teams} highlight={me?.id} compact limit={10} />
      {view.missedMine.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">{t('results.yourMissed')}</h2>
          <ul className="space-y-1.5">
            {view.missedMine.map((c) => (
              <li key={c.id} className="card p-3">
                <div className="font-semibold">{c.term}</div>
                <div className="text-sm text-muted">{c.definition}</div>
              </li>
            ))}
          </ul>
        </section>
      )}
      {!embedded && (
        <div className="flex flex-col gap-2 pb-4">
          {setCode && (
            <Link to={`/import?d=${encodeURIComponent(setCode)}`}>
              <Button full leftIcon={<BookmarkPlus size={16} />}>
                {t('results.saveSet')}
              </Button>
            </Link>
          )}
          <Link to="/">
            <Button full variant="secondary" leftIcon={<Home size={16} />}>
              {t('results.home')}
            </Button>
          </Link>
        </div>
      )}
    </div>
  )
}
