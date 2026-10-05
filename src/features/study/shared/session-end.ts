import { checkAchievements, recordStudyDay } from '@/features/achievements'

/** Called once when a study session finishes: streak day + instant achievement toasts. */
export async function endStudy(setId: string): Promise<void> {
  try {
    await recordStudyDay()
    await checkAchievements({ type: 'review', setId })
  } catch {
    /* achievements are optional */
  }
}
