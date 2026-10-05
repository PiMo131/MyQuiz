import { Modal } from '@/ui'

export interface ShareModalProps { open: boolean; onClose: () => void; setId: string }

export function ShareModal({ open, onClose }: ShareModalProps) {
  return <Modal open={open} onClose={onClose} title="Share">…</Modal>
}
