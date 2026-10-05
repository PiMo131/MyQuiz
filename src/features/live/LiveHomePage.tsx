import { useMemo, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowRight, Globe, Radio, Search, ShieldCheck, Smartphone, Wifi } from 'lucide-react'
import { db } from '@/db/db'
import { LIVE_MODES, DEFAULT_LIVE_CONFIG, codeFromText, isValidCode } from '@/domain/live/protocol'
import { Button, Card, Input, cn } from '@/ui'

export default function LiveHomePage() {
  const { t } = useTranslation('live')
  const { t: tc } = useTranslation()
  const navigate = useNavigate()
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const sets = useLiveQuery(() => db.sets.orderBy('updatedAt').reverse().toArray(), [])
  const counts = useLiveQuery(async () => {
    const all = await db.cards.toArray()
    const m = new Map<string, number>()
    for (const c of all) m.set(c.setId, (m.get(c.setId) ?? 0) + 1)
    return m
  }, [])
  const filtered = useMemo(() => (sets ?? []).filter((s) => !s.draft && s.title.toLowerCase().includes(query.toLowerCase())), [sets, query])

  const join = (e: FormEvent) => {
    e.preventDefault()
    const c = codeFromText(code)
    if (!isValidCode(c)) {
      setError(t('home.invalidCode'))
      return
    }
    navigate(`/live/join/${c}`)
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8 pb-10">
      <section className="card overflow-hidden bg-gradient-indigo p-6 text-white sm:p-10">
        <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide opacity-80">
          <Radio size={16} /> {t('title')}
        </div>
        <h1 className="mt-2 text-3xl font-black sm:text-5xl">{t('home.heading')}</h1>
        <p className="mt-3 max-w-2xl text-base opacity-90 sm:text-lg">{t('home.tagline')}</p>
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="flex flex-col gap-3">
          <h2 className="text-lg font-bold">{t('home.join')}</h2>
          <p className="text-sm text-muted">{t('home.joinHint')}</p>
          <form onSubmit={join} className="flex gap-2">
            <Input
              value={code}
              onChange={(e) => {
                setCode(e.target.value)
                setError(null)
              }}
              placeholder={t('home.codePlaceholder')}
              aria-label={t('join.code')}
              className="font-mono text-lg font-bold uppercase tracking-widest"
              autoCapitalize="characters"
              autoComplete="off"
            />
            <Button type="submit" rightIcon={<ArrowRight size={16} />}>
              {t('home.joinButton')}
            </Button>
          </form>
          {error && <p className="text-sm text-error">{error}</p>}
        </Card>
        <Card className="flex flex-col gap-3">
          <h2 className="text-lg font-bold">{t('home.host')}</h2>
          <p className="text-sm text-muted">{t('home.hostHint')}</p>
          <div className="relative">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('home.searchSets')} className="pl-9" aria-label={t('home.searchSets')} />
          </div>
          <ul className="max-h-64 space-y-1 overflow-y-auto scrollbar-thin" aria-label={t('home.pickSet')}>
            {sets && filtered.length === 0 && (
              <li className="rounded-xl bg-surface-2 p-3 text-sm text-muted">
                {t('home.noSets')}{' '}
                <Link to="/create" className="font-semibold text-primary hover:underline">
                  {tc('nav.createSet')}
                </Link>
              </li>
            )}
            {filtered.map((s) => (
              <li key={s.id}>
                <Link to={`/live/host/${s.id}`} className="flex items-center justify-between gap-3 rounded-xl px-3 py-2 hover:bg-surface-2">
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{s.title}</span>
                    <span className="block text-xs text-muted">{tc('common.terms', { count: counts?.get(s.id) ?? 0 })}</span>
                  </span>
                  <ArrowRight size={16} className="shrink-0 text-muted" />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <section>
        <h2 className="mb-3 text-lg font-bold">{t('home.modesTitle')}</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {LIVE_MODES.map((m, i) => (
            <Card key={m} className={cn('flex flex-col gap-1 p-4', ['border-l-4 border-l-primary', 'border-l-4 border-l-secondary', 'border-l-4 border-l-highlight', 'border-l-4 border-l-accent'][i])}>
              <div className="font-bold">{t(`modes.${m}.name`)}</div>
              <p className="text-sm text-muted">{t(`modes.${m}.desc`, { count: DEFAULT_LIVE_CONFIG.maxQuestions, seconds: DEFAULT_LIVE_CONFIG.blastSeconds })}</p>
            </Card>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-bold">{t('home.howTitle')}</h2>
        <ol className="grid gap-3 sm:grid-cols-2">
          {[
            { icon: Smartphone, text: t('home.how1') },
            { icon: Wifi, text: t('home.how2') },
            { icon: Globe, text: t('home.how3') },
            { icon: ShieldCheck, text: t('home.how4') },
          ].map(({ icon: Icon, text }, i) => (
            <li key={i} className="card flex gap-3 p-4">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">
                <Icon size={18} />
              </span>
              <p className="text-sm text-muted">{text}</p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  )
}
