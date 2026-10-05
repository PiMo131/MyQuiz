import { useEffect, useState } from 'react'
import { cn } from '@/ui'

/** Renders a QR code for `value` (library loaded lazily). */
export function QrCode({ value, size = 200, className }: { value: string; size?: number; className?: string }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    void import('qrcode')
      .then((m) => m.toDataURL(value, { width: size, margin: 1, errorCorrectionLevel: 'M', color: { dark: '#0f172a', light: '#ffffff' } }))
      .then((u) => !cancelled && setUrl(u))
      .catch(() => !cancelled && setUrl(null))
    return () => {
      cancelled = true
    }
  }, [value, size])
  return (
    <div className={cn('grid place-items-center overflow-hidden rounded-2xl bg-white p-2', className)} style={{ width: size + 16, height: size + 16 }}>
      {url ? <img src={url} width={size} height={size} alt="QR" className="block" /> : <div className="h-full w-full animate-pulse rounded-xl bg-surface-2" />}
    </div>
  )
}
