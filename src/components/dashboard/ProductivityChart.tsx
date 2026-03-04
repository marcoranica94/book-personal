import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { format } from 'date-fns'
import { it } from 'date-fns/locale'
import type { StatsSnapshot } from '@/types'

interface ProductivityChartProps {
  history: StatsSnapshot[]
}

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-white/10 bg-[#1A1A26] px-3 py-2 text-xs shadow-xl">
      <p className="text-slate-400">{label}</p>
      <p className="mt-0.5 font-semibold text-cyan-300">+{payload[0].value.toLocaleString('it')} parole</p>
    </div>
  )
}

export default function ProductivityChart({ history }: ProductivityChartProps) {
  if (history.length < 2) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-slate-600">
        I dati appariranno dopo 2+ sessioni di scrittura
      </div>
    )
  }

  const sorted = [...history].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
  const avg = sorted.reduce((sum, _, i) => {
    if (i === 0) return sum
    return sum + Math.max(0, sorted[i].totalWords - sorted[i - 1].totalWords)
  }, 0) / (sorted.length - 1)

  const data = sorted.slice(1).map((s, i) => ({
    date: format(new Date(s.date), 'd MMM', { locale: it }),
    parole: Math.max(0, s.totalWords - sorted[i].totalWords),
  }))

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
        <XAxis dataKey="date" tick={{ fill: '#475569', fontSize: 11 }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fill: '#475569', fontSize: 11 }} axisLine={false} tickLine={false} />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
        <Bar dataKey="parole" radius={[3, 3, 0, 0]}>
          {data.map((entry, index) => (
            <Cell
              key={`cell-${index}`}
              fill={entry.parole >= avg ? '#06B6D4' : '#1E3A4A'}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
