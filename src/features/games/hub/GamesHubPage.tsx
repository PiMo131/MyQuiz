import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { useLiveQuery } from 'dexie-react-hooks'
import { Trophy } from 'lucide-react'
import { db } from '@/db/db'
import type { GameScore } from '@/db/db'
import { Button, EmptyState, Label, Select } from '@/ui'
import { GAMES, GameIcon, GameIllustration, LAST_SET_KEY, formatBest, rememberLastSet } from '../shared'

export default function GamesHubPage() {
  const { t } = useTranslation(['games', 'common'])
  const navigate = useNavigate()
  const sets = useLiveQuery(() => db.sets.orderBy('updatedAt').reverse().toArray(), [])
  const [picked, setPicked] = useState<string>(() => {
    try {
      return localStorage.getItem(LAST_SET_KEY) ?? ''
    } catch {
      return ''
    }
  })
  // fall back to the most recent set when nothing (valid) is remembered
  const selected = picked && sets?.some((s) => s.id === picked) ? picked : (sets?.[0]?.id ?? '')
  const scores = useLiveQuery(async (): Promise<GameScore[]> => (selected ? db.scores.where('setId').equals(selected).toArray() : []), [selected])
  const cardCount = useLiveQuery(async (): Promise<number> => (selected ? db.cards.where('setId').equals(selected).count() : 0), [selected])
  const bestByGame = useMemo(() => new Map((scores ?? []).map((s) => [s.game, s.best])), [scores])

  const choose = (id: string) => {
    setPicked(id)
    rememberLastSet(id)
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="flex flex-col items-center gap-3 text-center">
        <h1 className="text-3xl font-extrabold sm:text-4xl">{t('games:hub.title')}</h1>
        <p className="max-w-xl text-sm text-muted sm:text-base">{t('games:hub.subtitle')}</p>
      </div>

      {sets && sets.length === 0 ? (
        <div className="mt-10">
          <EmptyState title={t('games:hub.noSets')} description={t('games:hub.noSetsDesc')} action={<Link to="/create"><Button>{t('games:hub.createSet')}</Button></Link>} />
        </div>
      ) : (
        <>
          <div className="mx-auto mt-8 flex w-full max-w-md flex-col gap-1.5">
            <Label htmlFor="games-set">{t('games:hub.chooseSet')}</Label>
            <div className="flex items-center gap-3">
              <Select id="games-set" value={selected} onChange={(e) => choose(e.target.value)} disabled={!sets}>
                {(sets ?? []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title}
                  </option>
                ))}
              </Select>
              {cardCount !== undefined && <span className="shrink-0 text-xs text-muted">{t('games:hub.cards', { count: cardCount })}</span>}
            </div>
          </div>

          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {GAMES.map((g) => {
              const best = bestByGame.get(g.id)
              return (
                <article key={g.id} className="card group flex flex-col gap-3 p-4 transition-shadow hover:shadow-pop">
                  <div className="flex items-center gap-2">
                    <GameIcon game={g.id} size={20} />
                    <h2 className="text-lg font-bold">{t(`common:modes.${g.id}`)}</h2>
                  </div>
                  <p className="min-h-10 text-sm text-muted">{t(`games:${g.id}.blurb`)}</p>
                  <button className="overflow-hidden rounded-xl" onClick={() => selected && navigate(`/set/${selected}/${g.id}`)} aria-label={`${t('games:hub.play')} ${t(`common:modes.${g.id}`)}`} disabled={!selected}>
                    <GameIllustration game={g.id} className="h-auto w-full transition-transform duration-300 group-hover:scale-[1.03]" />
                  </button>
                  <div className="mt-auto flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-highlight">
                      <Trophy size={14} /> {best !== undefined ? t('games:hub.best', { value: formatBest(g.id, best) }) : <span className="text-faint">{t('games:hub.noBest')}</span>}
                    </span>
                    <Button size="sm" onClick={() => selected && navigate(`/set/${selected}/${g.id}`)} disabled={!selected}>
                      {t('games:hub.play')}
                    </Button>
                  </div>
                </article>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
