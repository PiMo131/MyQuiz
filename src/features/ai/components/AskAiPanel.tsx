import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowUp, ChevronDown, History, Plus, Sparkles, Square, Trash2, X } from 'lucide-react'
import { db } from '@/db/db'
import { getCards } from '@/db/repo'
import type { Card } from '@/domain/types'
import { tutorSystemPrompt } from '@/domain/ai/prompts'
import { Badge, Markdown, cn } from '@/ui'
import { chatStream, resolveProvider } from '../providers/router'
import type { ActiveProviderKind, ChatMessage } from '../providers/types'
import {
  heuristicReply,
  initialTutorState,
  starterText,
  STARTERS,
  type StarterId,
  type TutorState,
} from '../tutor'
import { ProviderChip } from './ProviderChip'

interface Msg {
  id: string
  role: 'user' | 'assistant'
  text: string
  provider?: ActiveProviderKind
}
interface Chat {
  id: string
  title: string
  createdAt: number
  messages: Msg[]
}

const storageKey = (setId: string) => `myquizz.ai.chats.${setId}`
function loadChats(setId: string): Chat[] {
  try {
    const raw = localStorage.getItem(storageKey(setId))
    return raw ? (JSON.parse(raw) as Chat[]) : []
  } catch {
    return []
  }
}
function saveChats(setId: string, chats: Chat[]) {
  try {
    localStorage.setItem(storageKey(setId), JSON.stringify(chats.slice(0, 20)))
  } catch {
    /* private mode */
  }
}
const uid = () => Math.random().toString(36).slice(2, 10)

/** Floating "Ask AI ✦" pill that opens a tutor chat sheet using the set as context. */
export function AskAiPanel({ setId }: { setId: string }) {
  const { t, i18n } = useTranslation('ai')
  const set = useLiveQuery(() => db.sets.get(setId), [setId])
  const [open, setOpen] = useState(false)
  const [cards, setCards] = useState<Card[]>([])
  const [chats, setChats] = useState<Chat[]>(() => loadChats(setId))
  const [activeId, setActiveId] = useState<string | null>(null)
  const [showHistory, setShowHistory] = useState(false)
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const tutor = useRef<TutorState>(initialTutorState())
  const abort = useRef<AbortController | null>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const lang = i18n.language

  useEffect(() => {
    if (open) void getCards(setId).then(setCards)
  }, [open, setId])
  useEffect(() => {
    saveChats(setId, chats)
  }, [chats, setId])
  const active = useMemo(() => chats.find((c) => c.id === activeId) ?? null, [chats, activeId])
  const lastText = active?.messages[active.messages.length - 1]?.text
  const msgCount = active?.messages.length ?? 0
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight })
  }, [msgCount, lastText])

  const updateChat = useCallback(
    (id: string, fn: (c: Chat) => Chat) => setChats((cs) => cs.map((c) => (c.id === id ? fn(c) : c))),
    [],
  )

  const send = async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || busy) return
    let chatId = activeId
    if (!chatId) {
      chatId = uid()
      const chat: Chat = { id: chatId, title: trimmed.slice(0, 48), createdAt: Date.now(), messages: [] }
      setChats((cs) => [chat, ...cs])
      setActiveId(chatId)
      tutor.current = initialTutorState()
    }
    const id = chatId
    const userMsg: Msg = { id: uid(), role: 'user', text: trimmed }
    const botId = uid()
    updateChat(id, (c) => ({
      ...c,
      messages: [...c.messages, userMsg, { id: botId, role: 'assistant', text: '' }],
    }))
    setInput('')
    setBusy(true)
    const ctl = new AbortController()
    abort.current = ctl
    const history = (chats.find((c) => c.id === id)?.messages ?? []).filter((m) => m.text)
    const fallback = () => {
      const r = heuristicReply(trimmed, tutor.current, cards, lang)
      tutor.current = r.state
      updateChat(id, (c) => ({
        ...c,
        messages: c.messages.map((m) =>
          m.id === botId ? { ...m, text: r.reply, provider: 'heuristics' } : m,
        ),
      }))
    }
    try {
      const provider = await resolveProvider()
      if (!provider || tutor.current.mode === 'quiz') {
        fallback()
      } else {
        const msgs: ChatMessage[] = [
          { role: 'system', content: tutorSystemPrompt(set?.title ?? '', cards, lang) },
          ...history.slice(-10).map((m): ChatMessage => ({ role: m.role, content: m.text })),
          { role: 'user', content: trimmed },
        ]
        let got = ''
        for await (const chunk of chatStream(msgs, {
          maxTokens: 400,
          temperature: 0.6,
          signal: ctl.signal,
        })) {
          got += chunk
          const snapshot = got
          updateChat(id, (c) => ({
            ...c,
            messages: c.messages.map((m) =>
              m.id === botId ? { ...m, text: snapshot, provider: provider.kind } : m,
            ),
          }))
        }
        if (!got.trim()) fallback()
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError') fallback()
    } finally {
      setBusy(false)
    }
  }

  const stopGen = () => abort.current?.abort()
  const newChat = () => {
    setActiveId(null)
    tutor.current = initialTutorState()
    setShowHistory(false)
    inputRef.current?.focus()
  }
  const removeChat = (id: string) => {
    setChats((cs) => cs.filter((c) => c.id !== id))
    if (activeId === id) newChat()
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-5 left-1/2 z-40 inline-flex -translate-x-1/2 items-center gap-2 rounded-full bg-gradient-indigo px-5 py-3 text-sm font-semibold text-white shadow-pop transition hover:brightness-105 safe-bottom"
        aria-label={t('ask.open')}
      >
        <Sparkles size={16} />
        {t('ask.pill')}
      </button>
    )
  }

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-40 mx-auto flex h-[min(80dvh,640px)] w-full max-w-xl flex-col overflow-hidden rounded-t-3xl border border-border bg-surface shadow-pop sm:bottom-4 sm:rounded-3xl"
      role="dialog"
      aria-label={t('ask.title')}
    >
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <button
          type="button"
          onClick={() => setShowHistory((v) => !v)}
          aria-label={t('ask.history')}
          aria-pressed={showHistory}
          className={cn(
            'rounded-lg p-2 text-muted hover:bg-surface-2',
            showHistory && 'bg-surface-2 text-text',
          )}
        >
          <History size={18} />
        </button>
        <Badge tone="secondary">{t('common.beta', { ns: 'common' })}</Badge>
        <span className="ml-1 truncate text-sm font-semibold">{t('ask.title')}</span>
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={newChat}
            aria-label={t('ask.newChat')}
            className="rounded-lg p-2 text-muted hover:bg-surface-2"
          >
            <Plus size={18} />
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label={t('ask.minimize')}
            className="rounded-lg p-2 text-muted hover:bg-surface-2"
          >
            <ChevronDown size={18} />
          </button>
        </div>
      </div>
      <div className="flex min-h-0 flex-1">
        {showHistory && (
          <aside className="w-44 shrink-0 overflow-y-auto border-r border-border p-2 text-sm">
            {chats.length === 0 && <p className="p-2 text-xs text-muted">{t('ask.noHistory')}</p>}
            {chats.map((c) => (
              <div
                key={c.id}
                className={cn(
                  'group flex items-center gap-1 rounded-lg px-2 py-1.5 hover:bg-surface-2',
                  c.id === activeId && 'bg-surface-2',
                )}
              >
                <button
                  type="button"
                  onClick={() => {
                    setActiveId(c.id)
                    tutor.current = initialTutorState()
                  }}
                  className="min-w-0 flex-1 truncate text-left"
                >
                  {c.title}
                </button>
                <button
                  type="button"
                  onClick={() => removeChat(c.id)}
                  aria-label={t('common.delete', { ns: 'common' })}
                  className="rounded p-1 text-muted opacity-0 hover:text-error group-hover:opacity-100 focus:opacity-100"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </aside>
        )}
        <div className="flex min-w-0 flex-1 flex-col">
          <div ref={listRef} className="flex-1 overflow-y-auto px-4 py-4">
            {!active || active.messages.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
                <div className="text-xl font-bold">{t('ask.prompt')}</div>
                <div className="flex flex-col items-center gap-2">
                  {STARTERS.map((s: StarterId) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => void send(starterText(s, lang))}
                      className="rounded-full border border-primary/40 bg-surface px-4 py-2 text-sm font-medium shadow-sm transition hover:bg-primary-soft"
                    >
                      {starterText(s, lang)}
                    </button>
                  ))}
                </div>
                <p className="max-w-xs text-xs text-muted">
                  {t('ask.contextHint', { title: set?.title ?? '' })}
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {active.messages.map((m) => (
                  <div key={m.id} className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
                    {m.role === 'user' ? (
                      <div className="max-w-[85%] rounded-2xl rounded-br-md bg-surface-2 px-4 py-2 text-sm">
                        {m.text}
                      </div>
                    ) : (
                      <div className="max-w-[95%] text-sm">
                        <Sparkles size={16} className="mb-1 text-primary" />
                        {m.text ? (
                          <Markdown src={m.text} as="div" className="leading-relaxed [&_br]:block" />
                        ) : (
                          <span className="inline-block h-4 w-20 animate-pulse rounded bg-border" />
                        )}
                        {m.provider && (
                          <div className="mt-1">
                            <ProviderChip provider={m.provider} link={false} className="text-[10px]" />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
          <form
            className="border-t border-border p-3"
            onSubmit={(e) => {
              e.preventDefault()
              void send(input)
            }}
          >
            <div className="flex items-end gap-2 rounded-2xl border border-border bg-surface px-3 py-2 focus-within:border-primary">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    void send(input)
                  }
                }}
                rows={1}
                placeholder={t('ask.placeholder')}
                aria-label={t('ask.placeholder')}
                className="max-h-28 min-h-6 flex-1 resize-none bg-transparent text-sm outline-none placeholder:text-faint"
              />
              {busy ? (
                <button
                  type="button"
                  onClick={stopGen}
                  aria-label={t('ask.stop')}
                  className="grid h-8 w-8 place-items-center rounded-full bg-surface-2 text-text"
                >
                  <Square size={14} />
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!input.trim()}
                  aria-label={t('ask.send')}
                  className="grid h-8 w-8 place-items-center rounded-full bg-primary text-white disabled:opacity-40"
                >
                  <ArrowUp size={16} />
                </button>
              )}
            </div>
            <div className="mt-2 flex items-center justify-between text-[11px] text-muted">
              <span>{t('footer.disclaimer')}</span>
              <ProviderChip />
            </div>
          </form>
        </div>
      </div>
      <button type="button" onClick={() => setOpen(false)} className="sr-only">
        <X size={1} />
        {t('common.close', { ns: 'common' })}
      </button>
    </div>
  )
}
