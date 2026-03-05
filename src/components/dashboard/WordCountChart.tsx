import {Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,} from 'recharts'
import {format} from 'date-fns'
import {it} from 'date-fns/locale'
import type {StatsSnapshot} from '@/types'
import {useChartColors} from '@/hooks/useChartColors'

interface WordCountChartProps {
  history: StatsSnapshot[]
}

function CustomTooltip({ active, payload, label, colors }: {
  active?: boolean
  payload?: { value: number }[]
  label?: string
  colors: ReturnType<typeof useChartColors>
}) {
  if (!active || !payload?.length) return null
  return (
    <div
      className="rounded-lg px-3 py-2 text-xs shadow-xl"
      style={{ background: colors.tooltip, border: `1px solid ${colors.tooltipBorder}` }}
    >
      <p className="text-slate-400">{label}</p>
      <p className="mt-0.5 font-semibold text-violet-300">
        {payload[0].value.toLocaleString('it')} parole
      </p>
    </div>
  )
}

export default function WordCountChart({ history }: WordCountChartProps) {
  const colors = useChartColors()

  if (history.length < 2) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-slate-600">
        I dati appariranno dopo 2+ sessioni di scrittura
      </div>
    )
  }

  const data = history.map((s) => ({
    date: format(new Date(s.date), 'd MMM', { locale: it }),
    parole: s.totalWords,
  }))

  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
        <defs>
          <linearGradient id="wordGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#7C3AED" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#7C3AED" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={colors.grid} />
        <XAxis dataKey="date" tick={{ fill: colors.axis, fontSize: 11 }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fill: colors.axis, fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`} />
        <Tooltip content={<CustomTooltip colors={colors} />} />
        <Area type="monotone" dataKey="parole" stroke="#7C3AED" strokeWidth={2} fill="url(#wordGrad)" dot={false} activeDot={{ r: 4, fill: '#A855F7' }} />
      </AreaChart>
    </ResponsiveContainer>
  )
}
