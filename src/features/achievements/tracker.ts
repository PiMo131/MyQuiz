export type AchievementEvent = { type: string } | undefined
export async function recordStudyDay(): Promise<void> {}
export async function checkAchievements(_event?: AchievementEvent): Promise<string[]> { return [] }
export function useStudyTracker(): void {}
