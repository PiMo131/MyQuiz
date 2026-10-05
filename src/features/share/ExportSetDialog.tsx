import { Modal } from '@/ui'

export interface ExportSetDialogProps { open: boolean; onClose: () => void; setId: string }

export function ExportSetDialog({ open, onClose }: ExportSetDialogProps) {
  return <Modal open={open} onClose={onClose} title="Export">…</Modal>
}
