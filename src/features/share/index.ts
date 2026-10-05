/**
 * Public API of the share feature (used by SetPage and Settings).
 *  - ShareModal({ open, onClose, setId })        share link / QR / file / web share / email / embed / calendar
 *  - ExportSetDialog({ open, onClose, setId })   export to json/csv/tsv/anki/quizlet/markdown, optional encryption
 *  - useShareSet(setId)                           { url, copyLink, downloadJson, webShare, qrDataUrl, ... }
 *  - CalendarMenuItems(setId, title): MenuItem[]  / AddToCalendarButton({ setId, title })
 *  - BackupPanel                                  Settings card: export / restore full backup (merge or replace)
 */
export { ShareModal, type ShareModalProps } from './ShareModal'
export { ExportSetDialog, type ExportSetDialogProps } from './ExportSetDialog'
export { useShareSet, type ShareSetApi } from './useShareSet'
export { CalendarMenuItems, AddToCalendarButton } from './calendar'
export { BackupPanel } from './BackupPanel'
