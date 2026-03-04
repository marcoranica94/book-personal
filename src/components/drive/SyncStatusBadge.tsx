import { AlertTriangle, CheckCircle2, Cloud, CloudOff, Loader2, Upload } from 'lucide-react'
import type { SyncStatus } from '@/types'
import { SyncStatus as SS } from '@/types'
import { cn } from '@/utils/cn'

interface SyncStatusBadgeProps {
  status: SyncStatus | undefined
  error?: string | null
  className?: string
  showLabel?: boolean
}

const CONFIG: Record<
  SyncStatus,
  { icon: React.ElementType; color: string; label: string; spin?: boolean }
> = {
  [SS.SYNCED]: { icon: CheckCircle2, color: 'text-emerald-500', label: 'Sincronizzato' },
  [SS.PENDING_PUSH]: { icon: Upload, color: 'text-amber-400', label: 'Da caricare', spin: false },
  [SS.PENDING_PULL]: { icon: Loader2, color: 'text-blue-400', label: 'Scaricando', spin: true },
  [SS.CONFLICT]: { icon: AlertTriangle, color: 'text-red-400', label: 'Conflitto' },
  [SS.ERROR]: { icon: CloudOff, color: 'text-red-500', label: 'Errore' },
  [SS.NOT_LINKED]: { icon: Cloud, color: 'text-slate-600', label: 'Non collegato' },
}

export default function SyncStatusBadge({
  status,
  error,
  className,
  showLabel = false,
}: SyncStatusBadgeProps) {
  if (!status) return null

  const cfg = CONFIG[status]
  const Icon = cfg.icon
  const title = error ? `${cfg.label}: ${error}` : cfg.label

  return (
    <span
      className={cn('flex items-center gap-1', cfg.color, className)}
      title={title}
    >
      <Icon className={cn('h-3.5 w-3.5', cfg.spin && 'animate-spin')} />
      {showLabel && <span className="text-xs">{cfg.label}</span>}
    </span>
  )
}
