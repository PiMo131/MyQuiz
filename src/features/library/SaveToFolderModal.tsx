import { Modal } from '@/ui'

export interface SaveToFolderModalProps {
  open: boolean
  onClose: () => void
  setId: string
}

/** Stub; replaced by the full implementation. */
export function SaveToFolderModal({ open, onClose }: SaveToFolderModalProps) {
  return (
    <Modal open={open} onClose={onClose} title="Save to folder">
      <div />
    </Modal>
  )
}
