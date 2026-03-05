import {Cell, Pie, PieChart, ResponsiveContainer, Tooltip} from 'recharts'
import type {ChapterStatus} from '@/types'
import {STATUS_CONFIG} from '@/types'
import {useChartColors} from '@/hooks/useChartColors'

const STATUS_COLORS: Record<ChapterStatus, string> = {
  TODO: '#64748B',
  IN_PROGRESS: '#3B82F6',
  REVIEW: '#F59E0B',
  EXTERNAL_REVIEW: '#8B5CF6',
  REFINEMENT: '#06B6D4',
  DONE: '#10B981',
}

interface StatusDonutChartProps {
  counts: Record<ChapterStatus, number>
}

function CustomTooltip({ active, payload, colors }: {
  active?: boolean
  payload?: { name: string; value: number }[]
  colors: ReturnType<typeof useChartColors>
}) {
  if (!active || !payload?.length) return null
  return (
    <div
      className="rounded-lg px-3 py-2 text-xs shadow-xl"
      style={{ background: colors.tooltip, border: `1px solid ${colors.tooltipBorder}` }}
    >
      <p className="text-slate-300">{STATUS_CONFIG[payload[0].name as ChapterStatus]?.label ?? payload[0].name}</p>
      <p className="font-semibold text-[var(--text-primary)]">{payload[0].value} capitoli</p>
    </div>
  )
}

export default function StatusDonutChart({ counts }: StatusDonutChartProps) {
  const colors = useChartColors()
  const data = Object.entries(counts)
    .filter(([, v]) => v > 0)
    .map(([key, value]) => ({ name: key, value }))

  const total = data.reduce((s, d) => s + d.value, 0)

  if (total === 0) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-slate-600">
        Nessun capitolo ancora
      </div>
    )
  }

  return (
    <div className="flex h-full items-center gap-4">
      <div className="h-full flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} cx="50%" cy="50%" innerRadius="55%" outerRadius="80%"
              dataKey="value" strokeWidth={0}>
              {data.map((entry) => (
                <Cell key={entry.name} fill={STATUS_COLORS[entry.name as ChapterStatus]} />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip colors={colors} />} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="shrink-0 space-y-1.5">
        {data.map((d) => (
          <div key={d.name} className="flex items-center gap-2 text-xs">
            <span className="h-2 w-2 rounded-full shrink-0" style={{ background: STATUS_COLORS[d.name as ChapterStatus] }} />
            <span className="text-slate-400">{STATUS_CONFIG[d.name as ChapterStatus]?.label}</span>
            <span className="ml-auto font-medium text-[var(--text-primary)]">{d.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
