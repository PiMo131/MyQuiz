/** Template-based explanation of an answer (heuristic fallback for ExplainButton). */
import type { Card, QuestionType } from '@/domain/types'
import { plainText } from '@/domain/text'
import { gradeAnswer, diffAnswer } from '@/domain/grading'
import { mnemonicCue } from './mnemonics'

export interface ExplainInput {
  card: Card
  givenAnswer?: string
  questionType?: QuestionType
  lang: string
  /** Which side was asked: the user had to produce 'definition' (default) or 'term'. */
  side?: 'term' | 'definition'
}

export function explainTemplate(input: ExplainInput): string {
  const { card, lang } = input
  const nl = lang.startsWith('nl')
  const side = input.side ?? 'definition'
  const prompt = plainText(side === 'definition' ? card.term : card.definition)
  const answer = plainText(side === 'definition' ? card.definition : card.term)
  const given = input.givenAnswer ? plainText(input.givenAnswer) : ''
  const lines: string[] = []

  lines.push(nl ? `**${prompt}** → **${answer}**.` : `**${prompt}** → **${answer}**.`)

  if (given) {
    const g = gradeAnswer(given, answer, { strictness: 'moderate' })
    if (g.correct) {
      lines.push(nl ? `Je antwoord *${given}* is goed.` : `Your answer *${given}* is correct.`)
    } else if (g.similarity >= 0.6) {
      const d = diffAnswer(given, answer)
      const missing = d.expected
        .filter((p) => p.type === 'missing')
        .map((p) => p.text)
        .join('')
      lines.push(
        nl
          ? `Je zat dichtbij met *${given}*: let op de spelling${missing ? ` (ontbrekend: "${missing}")` : ''}.`
          : `You were close with *${given}*: check the spelling${missing ? ` (missing: "${missing}")` : ''}.`,
      )
    } else {
      lines.push(
        nl
          ? `*${given}* is niet juist. Het verschil: "${answer}" hoort bij "${prompt}", niet "${given}".`
          : `*${given}* is not right. The difference: "${answer}" belongs with "${prompt}", not "${given}".`,
      )
    }
  }

  if (card.hint) lines.push((nl ? 'Hint: ' : 'Hint: ') + plainText(card.hint))
  if (card.example) lines.push((nl ? 'Voorbeeld: ' : 'Example: ') + plainText(card.example))
  lines.push((nl ? 'Ezelsbruggetje: ' : 'Mnemonic: ') + (card.mnemonic ? plainText(card.mnemonic) : mnemonicCue(card.term, card.definition, lang)))

  return lines.join('\n\n')
}
