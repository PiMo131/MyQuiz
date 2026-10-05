import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowLeft, Printer } from 'lucide-react'
import { db } from '@/db/db'
import { getCards, mediaUrl } from '@/db/repo'
import { Button, Markdown, Select, Toggle, cn } from '@/ui'

type Layout = 'cards' | 'list' | 'termsOnly'
type FontSize = 'sm' | 'md' | 'lg'

const PRINT_CSS = `
@page { margin: 12mm; }
@media print {
  html, body { background: #fff !important; color: #000 !important; }
  .print-root { padding: 0 !important; max-width: none !important; }
  .print-card { break-inside: avoid; page-break-inside: avoid; border: 1px solid #999 !important; background: #fff !important; box-shadow: none !important; }
  .print-row { break-inside: avoid; page-break-inside: avoid; border-color: #bbb !important; }
  .prose-card mark { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
}
`

export default function PrintPage() {
  const { t } = useTranslation('share')
  const { setId = '' } = useParams()
  const set = useLiveQuery(() => db.sets.get(setId), [setId])
  const cards = useLiveQuery(() => getCards(setId), [setId])
  const [layout, setLayout] = useState<Layout>('cards')
  const [withDefinitions, setWithDefinitions] = useState(true)
  const [withImages, setWithImages] = useState(true)
  const [withHints, setWithHints] = useState(false)
  const [fontSize, setFontSize] = useState<FontSize>('md')
  const [urls, setUrls] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!cards || !withImages) return
    let alive = true
    void (async () => {
      const out: Record<string, string> = {}
      for (const c of cards) {
        for (const id of [c.image?.term, c.image?.definition]) {
          if (id && !out[id]) {
            const u = await mediaUrl(id)
            if (u) out[id] = u
          }
        }
      }
      if (alive) setUrls(out)
    })()
    return () => {
      alive = false
    }
  }, [cards, withImages])

  const fs = { sm: 'text-xs', md: 'text-sm', lg: 'text-base' }[fontSize]
  const showDef = layout !== 'termsOnly' && withDefinitions

  return (
    <div className="min-h-dvh bg-bg text-text">
      <style>{PRINT_CSS}</style>
      <header className="no-print sticky top-0 z-10 border-b border-border bg-bg/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-3 px-4 py-3">
          <Link to={`/set/${setId}`} className="inline-flex items-center gap-1 text-sm font-semibold text-muted hover:text-text">
            <ArrowLeft size={16} />
            {t('common:common.back')}
          </Link>
          <h1 className="min-w-0 flex-1 truncate text-base font-bold">{set?.title ?? '…'}</h1>
          <Button leftIcon={<Printer size={16} />} onClick={() => window.print()} disabled={!cards?.length}>
            {t('print.print')}
          </Button>
        </div>
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-5 gap-y-2 px-4 pb-3 text-sm">
          <label className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted">{t('print.layout')}</span>
            <Select value={layout} onChange={(e) => setLayout(e.target.value as Layout)} className="h-9 w-auto py-1">
              <option value="cards">{t('print.layouts.cards')}</option>
              <option value="list">{t('print.layouts.list')}</option>
              <option value="termsOnly">{t('print.layouts.termsOnly')}</option>
            </Select>
          </label>
          <label className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted">{t('print.fontSize')}</span>
            <Select value={fontSize} onChange={(e) => setFontSize(e.target.value as FontSize)} className="h-9 w-auto py-1">
              <option value="sm">{t('print.sizes.sm')}</option>
              <option value="md">{t('print.sizes.md')}</option>
              <option value="lg">{t('print.sizes.lg')}</option>
            </Select>
          </label>
          {layout !== 'termsOnly' && (
            <label className="flex items-center gap-2">
              <Toggle checked={withDefinitions} onChange={setWithDefinitions} id="print-defs" />
              {t('print.withDefinitions')}
            </label>
          )}
          <label className="flex items-center gap-2">
            <Toggle checked={withImages} onChange={setWithImages} id="print-imgs" />
            {t('print.withImages')}
          </label>
          <label className="flex items-center gap-2">
            <Toggle checked={withHints} onChange={setWithHints} id="print-hints" />
            {t('print.withHints')}
          </label>
        </div>
      </header>

      <main className={cn('print-root mx-auto max-w-5xl px-4 py-6', fs)}>
        <div className="mb-4 hidden print:block">
          <h1 className="text-xl font-bold">{set?.title}</h1>
          {set?.description && <p className="text-sm">{set.description}</p>}
        </div>

        {layout === 'cards' && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 print:grid-cols-2">
            {cards?.map((c, i) => (
              <div key={c.id} className="print-card card flex min-h-40 flex-col p-4">
                <div className="mb-2 text-[10px] font-semibold text-muted">{i + 1}</div>
                <div className="flex flex-1 flex-col justify-center gap-2 text-center">
                  {withImages && c.image?.term && urls[c.image.term] && <img src={urls[c.image.term]} alt="" className="mx-auto max-h-24 rounded object-contain" />}
                  <Markdown src={c.cloze ?? c.term} className="font-semibold" as="div" />
                  {showDef && (
                    <>
                      <hr className="my-1 border-dashed" />
                      {withImages && c.image?.definition && urls[c.image.definition] && <img src={urls[c.image.definition]} alt="" className="mx-auto max-h-24 rounded object-contain" />}
                      <Markdown src={c.definition} as="div" />
                    </>
                  )}
                  {withHints && c.hint && <div className="text-xs italic text-muted">{c.hint}</div>}
                </div>
              </div>
            ))}
          </div>
        )}

        {layout === 'list' && (
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b-2 border-border text-left text-[10px] font-semibold uppercase tracking-wide text-muted">
                <th className="w-8 py-2 pr-2">#</th>
                <th className="py-2 pr-4">{t('common:common.term')}</th>
                {showDef && <th className="py-2">{t('common:common.definition')}</th>}
              </tr>
            </thead>
            <tbody>
              {cards?.map((c, i) => (
                <tr key={c.id} className="print-row border-b border-border align-top">
                  <td className="py-2 pr-2 text-muted">{i + 1}</td>
                  <td className="py-2 pr-4">
                    {withImages && c.image?.term && urls[c.image.term] && <img src={urls[c.image.term]} alt="" className="mb-1 max-h-16 rounded object-contain" />}
                    <Markdown src={c.cloze ?? c.term} className="font-medium" as="div" />
                    {withHints && c.hint && <div className="text-xs italic text-muted">{c.hint}</div>}
                  </td>
                  {showDef && (
                    <td className="py-2">
                      {withImages && c.image?.definition && urls[c.image.definition] && <img src={urls[c.image.definition]} alt="" className="mb-1 max-h-16 rounded object-contain" />}
                      <Markdown src={c.definition} as="div" />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {layout === 'termsOnly' && (
          <ol className="columns-2 gap-8 sm:columns-3 print:columns-3">
            {cards?.map((c, i) => (
              <li key={c.id} className="print-row mb-2 flex gap-2 break-inside-avoid">
                <span className="w-6 shrink-0 text-right text-muted">{i + 1}.</span>
                <span>
                  <Markdown src={c.cloze ?? c.term} className="font-medium" />
                  {withHints && c.hint && <span className="block text-xs italic text-muted">{c.hint}</span>}
                  <span className="mt-1 block h-4 border-b border-dotted border-border print:border-black" aria-hidden />
                </span>
              </li>
            ))}
          </ol>
        )}

        {cards && cards.length === 0 && <p className="py-10 text-center text-sm text-muted">{t('print.empty')}</p>}
      </main>
    </div>
  )
}
