import { lazy, type ComponentType, type LazyExoticComponent } from 'react'

/**
 * Route registry. Each feature registers its routes here (one line per route).
 * `shell: false` renders the page full-screen without the sidebar (study modes, games, live).
 */
export interface AppRoute {
  path: string
  component: LazyExoticComponent<ComponentType<unknown>>
  shell?: boolean
}

const page = (loader: () => Promise<{ default: ComponentType<unknown> }>) => lazy(loader)

export const routes: AppRoute[] = [
  // Shell pages (feature D)
  { path: '/', component: page(() => import('@/features/home/HomePage')) },
  { path: '/library', component: page(() => import('@/features/library/LibraryPage')) },
  { path: '/folders/:folderId', component: page(() => import('@/features/library/FolderPage')) },
  { path: '/search', component: page(() => import('@/features/search/SearchPage')) },
  { path: '/settings', component: page(() => import('@/features/settings/SettingsPage')) },
  { path: '/achievements', component: page(() => import('@/features/achievements/AchievementsPage')) },
  { path: '/stats', component: page(() => import('@/features/achievements/StatsPage')) },
  { path: '/notifications', component: page(() => import('@/features/notifications/NotificationsPage')) },
  // Editor / share (feature A)
  { path: '/create', component: page(() => import('@/features/editor/EditorPage')) },
  { path: '/set/:setId/edit', component: page(() => import('@/features/editor/EditorPage')) },
  { path: '/import', component: page(() => import('@/features/share/ImportPage')) },
  { path: '/embed/:code', component: page(() => import('@/features/share/EmbedPage')), shell: false },
  // Set page (feature B owns it, it links to everything)
  { path: '/set/:setId', component: page(() => import('@/features/study/SetPage')) },
  { path: '/set/:setId/print', component: page(() => import('@/features/share/PrintPage')), shell: false },
  // Study modes (feature B) — full screen
  { path: '/set/:setId/flashcards', component: page(() => import('@/features/study/flashcards/FlashcardsPage')), shell: false },
  { path: '/set/:setId/srs', component: page(() => import('@/features/study/srs/SrsPage')), shell: false },
  { path: '/set/:setId/learn', component: page(() => import('@/features/study/learn/LearnPage')), shell: false },
  { path: '/set/:setId/write', component: page(() => import('@/features/study/write/WritePage')), shell: false },
  { path: '/set/:setId/spell', component: page(() => import('@/features/study/spell/SpellPage')), shell: false },
  { path: '/set/:setId/test', component: page(() => import('@/features/study/test/TestPage')), shell: false },
  // Games (feature C) — full screen
  { path: '/games', component: page(() => import('@/features/games/hub/GamesHubPage')) },
  { path: '/set/:setId/match', component: page(() => import('@/features/games/match/MatchPage')), shell: false },
  { path: '/set/:setId/blocks', component: page(() => import('@/features/games/blocks/BlocksPage')), shell: false },
  { path: '/set/:setId/blast', component: page(() => import('@/features/games/blast/BlastPage')), shell: false },
  { path: '/set/:setId/charms', component: page(() => import('@/features/games/charms/CharmsPage')), shell: false },
  { path: '/set/:setId/hangman', component: page(() => import('@/features/games/hangman/HangmanPage')), shell: false },
  { path: '/set/:setId/wordsearch', component: page(() => import('@/features/games/wordsearch/WordSearchPage')), shell: false },
  { path: '/set/:setId/speedreview', component: page(() => import('@/features/games/speedreview/SpeedReviewPage')), shell: false },
  // Live (feature F)
  { path: '/live', component: page(() => import('@/features/live/LiveHomePage')) },
  { path: '/live/host/:setId', component: page(() => import('@/features/live/HostPage')), shell: false },
  { path: '/live/join', component: page(() => import('@/features/live/JoinPage')), shell: false },
  { path: '/live/join/:code', component: page(() => import('@/features/live/JoinPage')), shell: false },
  // AI tools (feature E)
  { path: '/ai', component: page(() => import('@/features/ai/AiHubPage')) },
  { path: '/ai/generate', component: page(() => import('@/features/ai/GeneratePage')) },
  { path: '/ai/study-guide', component: page(() => import('@/features/ai/StudyGuidePage')) },
  { path: '/ai/practice-test', component: page(() => import('@/features/ai/PracticeTestPage')) },
  { path: '/set/:setId/listen', component: page(() => import('@/features/ai/ListenPage')), shell: false },
]
