export function Logo({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="mq-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#6366f1" />
          <stop offset="1" stopColor="#a855f7" />
        </linearGradient>
        <linearGradient id="mq-g2" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#06b6da" />
          <stop offset="1" stopColor="#3b82f6" />
        </linearGradient>
      </defs>
      <rect x="4" y="4" width="56" height="56" rx="16" fill="url(#mq-g)" />
      <path d="M18 44V22l9 12 9-12v22" fill="none" stroke="#fff" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="46" cy="40" r="7" fill="none" stroke="url(#mq-g2)" strokeWidth="5" />
      <path d="M50 45l5 5" stroke="url(#mq-g2)" strokeWidth="5" strokeLinecap="round" />
    </svg>
  )
}
