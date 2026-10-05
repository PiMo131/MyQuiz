import type { AiProviderKind } from '@/domain/types'
import type { JsonSchema } from '@/domain/ai/schemas'

export type ChatRole = 'system' | 'user' | 'assistant'
export interface ChatMessage {
  role: ChatRole
  content: string
}

export interface ChatOptions {
  /** Ask for JSON output matching this schema (best effort per provider). */
  json?: JsonSchema
  maxTokens?: number
  temperature?: number
  signal?: AbortSignal
}

export type ActiveProviderKind = Exclude<AiProviderKind, 'auto'>
export type LlmProviderKind = Exclude<ActiveProviderKind, 'heuristics'>

export interface ChatProvider {
  kind: LlmProviderKind
  chat(messages: ChatMessage[], opts?: ChatOptions): Promise<string>
  chatStream(messages: ChatMessage[], opts?: ChatOptions): AsyncIterable<string>
}

export class AiUnavailableError extends Error {
  constructor(message = 'No AI provider available') {
    super(message)
    this.name = 'AiUnavailableError'
  }
}

/** Append a JSON instruction + schema to the system message for providers without native constraints. */
export function withJsonInstruction(messages: ChatMessage[], schema: JsonSchema | undefined): ChatMessage[] {
  if (!schema) return messages
  const rule = `\n\nReturn ONLY valid JSON matching this JSON schema (no prose, no code fences):\n${JSON.stringify(schema)}`
  const idx = messages.findIndex((m) => m.role === 'system')
  if (idx >= 0) return messages.map((m, i) => (i === idx ? { ...m, content: m.content + rule } : m))
  return [{ role: 'system', content: rule.trim() }, ...messages]
}

export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
}
