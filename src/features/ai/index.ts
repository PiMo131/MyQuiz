/**
 * Public API of the AI feature.
 * Everything degrades to heuristics; no network call happens without explicit user configuration.
 */
export { generateCards, generateCardsDetailed, generateDistractors, explainAnswer, explainAnswerStream, smartGrade } from './api'
export type { GeneratedCard, GenerateOptions, GenerateResult, ExplainInput, SmartGradeResult } from './api'
export { useAiStatus } from './useAiStatus'
export { ExplainButton } from './components/ExplainButton'
export type { ExplainButtonProps } from './components/ExplainButton'
export { AskAiPanel } from './components/AskAiPanel'
export { AiSettingsPanel } from './components/AiSettingsPanel'
export { ProviderChip, AiFooter, BetterResultsHint } from './components/ProviderChip'
export { TtsButton } from '@/features/tts'
export type { ActiveProviderKind, ChatMessage, ChatOptions } from './providers/types'
