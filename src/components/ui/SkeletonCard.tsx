import {cn} from '@/utils/cn'

export function SkeletonCard({className}: {className?: string}) {
  return (
    <div className={cn('animate-pulse rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-4', className)}>
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <div className="h-2.5 w-20 rounded-full bg-[var(--overlay)]" />
          <div className="mt-2.5 h-5 w-28 rounded-full bg-[var(--overlay)]" />
          <div className="mt-2 h-2 w-14 rounded-full bg-[var(--overlay)]" />
        </div>
        <div className="ml-3 h-9 w-9 shrink-0 rounded-lg bg-[var(--overlay)]" />
      </div>
    </div>
  )
}

export function SkeletonGrid({count = 8}: {count?: number}) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
      {Array.from({length: count}).map((_, i) => (
        <div key={i} className="col-span-2">
          <SkeletonCard />
        </div>
      ))}
    </div>
  )
}
