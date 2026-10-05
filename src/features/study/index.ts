/**
 * Public API of the study feature. Games and live reuse the full-screen header and the mode switcher.
 */
export { StudyHeader, type StudyHeaderProps } from './shared/StudyHeader'
export { ModeSwitcher, MODE_ICONS, STUDY_MODES, GAME_MODES, modePath, type ModeSwitcherProps } from './shared/ModeSwitcher'
export { FlipCard, type FlipCardProps } from './shared/FlipCard'
export { CardFace, useMediaUrl } from './shared/CardFace'
export { SpeakButton } from './shared/SpeakButton'
export { useSetData, progressMap, type SetData } from './shared/useSetData'
export { useKeys, useAnyKey } from './shared/useKeys'
export { sfx } from './shared/sounds'
export { celebrate } from './shared/confetti'
export { usePref } from './shared/usePref'
