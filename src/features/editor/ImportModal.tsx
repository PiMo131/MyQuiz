import { Modal } from '@/ui'

export interface ImportedCard { term: string; definition: string; hint?: string }
export interface ImportModalProps { open: boolean; onClose: () => void; onImport: (cards: ImportedCard[]) => void }

export function ImportModal({ open, onClose }: ImportModalProps) {
  return <Modal open={open} onClose={onClose} title="Import">…</Modal>
}
