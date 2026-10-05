import { db } from '@/db/db'
import { addCards, createSet } from '@/db/repo'

const DEMO_NL = {
  title: 'Effectief studeren',
  description: 'Een voorbeeldset om MyQuizz te ontdekken. Verwijder hem gerust.',
  cards: [
    ['Active recall', 'Jezelf actief informatie laten herinneren zonder naar je aantekeningen te kijken.'],
    ['Spaced repetition', 'Herhalen met steeds grotere tussenpozen, precies vóór je iets vergeet.'],
    ['Pomodoro-techniek', 'Studeren in blokken van 25 minuten met korte pauzes ertussen.'],
    ['Interleaving', 'Verschillende onderwerpen door elkaar oefenen in plaats van één voor één.'],
    ['Feynman-techniek', 'Een concept in eenvoudige woorden uitleggen om te checken of je het echt snapt.'],
    ['Elaboratie', 'Nieuwe kennis koppelen aan wat je al weet met voorbeelden en vragen.'],
    ['Retrieval practice', 'Oefenen met ophalen uit je geheugen, zoals met flashcards of oefentoetsen.'],
    ['Dual coding', 'Woorden combineren met beelden of schema\'s om beter te onthouden.'],
    ['Metacognitie', 'Nadenken over je eigen leerproces: wat weet ik, wat nog niet?'],
    ['Slaap', 'Tijdens slaap worden herinneringen geconsolideerd; leren zonder slaap werkt slechter.'],
    ['Toetsingseffect', 'Jezelf toetsen versterkt het geheugen meer dan herlezen.'],
    ['Cognitieve belasting', 'De hoeveelheid mentale inspanning; te veel tegelijk belemmert leren.'],
  ],
}
const DEMO_EN = {
  title: 'Effective study strategies',
  description: 'A sample set to explore MyQuizz. Feel free to delete it.',
  cards: [
    ['Active recall', 'Actively retrieving information from memory without looking at notes.'],
    ['Spaced repetition', 'Reviewing at increasing intervals, right before you would forget.'],
    ['Pomodoro technique', 'Studying in 25-minute blocks with short breaks in between.'],
    ['Interleaving', 'Mixing different topics in one session instead of blocking them.'],
    ['Feynman technique', 'Explaining a concept in simple words to check real understanding.'],
    ['Elaboration', 'Connecting new knowledge to what you already know with examples and questions.'],
    ['Retrieval practice', 'Practising recall, for example with flashcards or practice tests.'],
    ['Dual coding', 'Combining words with images or diagrams to remember better.'],
    ['Metacognition', 'Thinking about your own learning: what do I know, what not yet?'],
    ['Sleep', 'Memories consolidate during sleep; learning without sleep works worse.'],
    ['Testing effect', 'Testing yourself strengthens memory more than rereading.'],
    ['Cognitive load', 'The amount of mental effort; too much at once hinders learning.'],
  ],
}

export async function seedDemoIfEmpty(lang: 'nl' | 'en'): Promise<void> {
  const seeded = await db.kv.get('seeded')
  if (seeded) return
  const count = await db.sets.count()
  if (count === 0) {
    const demo = lang === 'nl' ? DEMO_NL : DEMO_EN
    const set = await createSet({ title: demo.title, description: demo.description, lang: { term: lang, definition: lang }, author: 'MyQuizz', tags: ['demo'] })
    await addCards(set.id, demo.cards.map(([term, definition]) => ({ setId: set.id, term, definition })))
  }
  await db.kv.put({ key: 'seeded', value: true })
}
