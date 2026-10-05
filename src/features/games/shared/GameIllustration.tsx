import type { GameId } from './gameMeta'

/** Small decorative SVG per game (hub cards + intro screens). Uses playful colours on purpose. */
export function GameIllustration({ game, className }: { game: GameId; className?: string }) {
  const common = { viewBox: '0 0 160 100', className, role: 'img' as const, 'aria-hidden': true }
  switch (game) {
    case 'match':
      return (
        <svg {...common}>
          <rect width="160" height="100" rx="12" fill="#fde7e3" />
          <g transform="rotate(-8 80 50)">
            <rect x="40" y="22" width="36" height="46" rx="6" fill="#7c3aed" />
            <path d="M58 36c-5-6-14 0-9 6l9 9 9-9c5-6-4-12-9-6z" fill="#fff" />
            <rect x="84" y="32" width="36" height="46" rx="6" fill="#fff" stroke="#c4b5fd" strokeWidth="2" />
            <rect x="92" y="44" width="20" height="4" rx="2" fill="#a78bfa" />
            <rect x="92" y="52" width="14" height="4" rx="2" fill="#a78bfa" />
            <rect x="92" y="60" width="18" height="4" rx="2" fill="#a78bfa" />
          </g>
        </svg>
      )
    case 'blocks':
      return (
        <svg {...common}>
          <rect width="160" height="100" rx="12" fill="#fef3c7" />
          {[
            [34, 18, '#fff'], [60, 18, '#f87171'], [86, 18, '#fff'], [112, 18, '#3b82f6'],
            [34, 44, '#3b82f6'], [60, 44, '#fff'], [86, 44, '#f87171'], [112, 44, '#fff'],
            [34, 70, '#f87171'], [60, 70, '#3b82f6'], [86, 70, '#fff'], [112, 70, '#f87171'],
          ].map(([x, y, f], i) => (
            <rect key={i} x={Number(x)} y={Number(y)} width="22" height="22" rx="5" fill={String(f)} stroke="#fcd34d" strokeWidth="1" />
          ))}
        </svg>
      )
    case 'blast':
      return (
        <svg {...common}>
          <rect width="160" height="100" rx="12" fill="#312e81" />
          <circle cx="40" cy="30" r="16" fill="#6d28d9" />
          <circle cx="36" cy="26" r="3" fill="#4c1d95" />
          <circle cx="120" cy="24" r="13" fill="#6d28d9" />
          <circle cx="86" cy="42" r="10" fill="#7c3aed" />
          <circle cx="80" cy="84" r="16" fill="#facc15" />
          <circle cx="80" cy="84" r="10" fill="#a3e635" />
          <circle cx="80" cy="84" r="5" fill="#fff" />
          <rect x="60" y="88" width="8" height="10" rx="2" fill="#38bdf8" />
          <rect x="92" y="88" width="8" height="10" rx="2" fill="#38bdf8" />
          <path d="M80 70V50" stroke="#f472b6" strokeWidth="3" strokeLinecap="round" />
        </svg>
      )
    case 'charms':
      return (
        <svg {...common}>
          <rect width="160" height="100" rx="12" fill="#67e8f9" />
          <polygon points="34,20 50,30 46,50 22,50 18,30" fill="#a7f3d0" />
          <rect x="62" y="18" width="30" height="30" rx="8" fill="#c4b5fd" />
          <circle cx="122" cy="34" r="15" fill="#fbcfe8" />
          <polygon points="46,62 66,62 56,84" fill="#fde68a" />
          <rect x="78" y="58" width="28" height="28" rx="14" fill="#86efac" />
          <path d="M126 60l4 8 9 1-7 6 2 9-8-4-8 4 2-9-7-6 9-1z" fill="#fff" />
          <path d="M30 70l2 4 4 .5-3 3 1 4-4-2-4 2 1-4-3-3 4-.5z" fill="#fff" />
        </svg>
      )
    case 'hangman':
      return (
        <svg {...common}>
          <rect width="160" height="100" rx="12" fill="#dcfce7" />
          <path d="M30 86h40M50 86V18h34v12" stroke="#15803d" strokeWidth="4" strokeLinecap="round" fill="none" />
          <circle cx="84" cy="40" r="9" fill="none" stroke="#15803d" strokeWidth="4" />
          <path d="M84 49v20M84 56l-10 8M84 56l10 8" stroke="#15803d" strokeWidth="4" strokeLinecap="round" />
          {['A', '_', 'P', '_', 'L'].map((ch, i) => (
            <g key={i}>
              <rect x={100 + i * 11 - 4} y="70" width="9" height="14" rx="2" fill="#fff" />
              <text x={100 + i * 11} y="81" fontSize="10" fontWeight="700" fill="#166534" textAnchor="middle" fontFamily="Inter, sans-serif">{ch}</text>
            </g>
          ))}
        </svg>
      )
    case 'wordsearch':
      return (
        <svg {...common}>
          <rect width="160" height="100" rx="12" fill="#e0f2fe" />
          <rect x="30" y="48" width="100" height="16" rx="8" fill="#38bdf8" opacity="0.5" />
          {'QWORDMLSEARCHKATPLZEBRA'.split('').slice(0, 24).map((ch, i) => (
            <text key={i} x={36 + (i % 8) * 13} y={32 + Math.floor(i / 8) * 20} fontSize="11" fontWeight="700" fill="#0c4a6e" textAnchor="middle" fontFamily="Inter, sans-serif">
              {ch}
            </text>
          ))}
        </svg>
      )
    case 'speedreview':
      return (
        <svg {...common}>
          <rect width="160" height="100" rx="12" fill="#ffe4e6" />
          <circle cx="54" cy="54" r="26" fill="#fff" stroke="#f43f5e" strokeWidth="4" />
          <path d="M54 54V36M54 54l12 8" stroke="#f43f5e" strokeWidth="4" strokeLinecap="round" />
          <rect x="48" y="20" width="12" height="6" rx="2" fill="#f43f5e" />
          {[0, 1, 2].map((i) => (
            <rect key={i} x="94" y={30 + i * 18} width="46" height="12" rx="6" fill={i === 1 ? '#fb7185' : '#fff'} stroke="#fda4af" strokeWidth="1.5" />
          ))}
        </svg>
      )
  }
}
