import { useTranslation } from 'react-i18next'
import { Button, Modal } from '@/ui'

export function ConfirmDialog({ open, onClose, onConfirm, title, body, confirmLabel, danger = true, busy }: { open: boolean; onClose: () => void; onConfirm: () => void; title: string; body?: string; confirmLabel?: string; danger?: boolean; busy?: boolean }) {
  const { t } = useTranslation()
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title={title}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} loading={busy}>{confirmLabel ?? t('common.delete')}</Button>
        </>
      }
    >
      {body && <p className="text-sm text-muted">{body}</p>}
    </Modal>
  )
}
