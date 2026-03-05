import {useChartColors} from '@/hooks/useChartColors'

interface ProgressRingProps {
  value: number   // 0-100
  size?: number
  stroke?: number
  label?: string
  sublabel?: string
  color?: string
}

export default function ProgressRing({
  value,
  size = 120,
  stroke = 10,
  label,
  sublabel,
  color = '#7C3AED',
}: ProgressRingProps) {
  const { track } = useChartColors()
  const r = (size - stroke) / 2
  const circ = 2 * Math.PI * r
  const offset = circ - (value / 100) * circ

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke={color} strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 1s cubic-bezier(0.4,0,0.2,1)' }}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        {label && <span className="text-xl font-bold text-[var(--text-primary)]">{label}</span>}
        {sublabel && <span className="text-xs text-slate-500">{sublabel}</span>}
      </div>
    </div>
  )
}
