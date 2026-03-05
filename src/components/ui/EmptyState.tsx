import {cn} from '@/utils/cn'

interface EmptyStateProps {
  icon: React.ComponentType<{ className?: string }>
  title: string
  description?: string
  action?: React.ReactNode
  className?: string
}

export default function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center py-16 text-center', className)}>
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--overlay)]">
        <Icon className="h-7 w-7 text-slate-500" />
      </div>
      <p className="text-sm font-medium text-slate-400">{title}</p>
      {description && <p className="mt-1 max-w-xs text-xs text-slate-600">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}
