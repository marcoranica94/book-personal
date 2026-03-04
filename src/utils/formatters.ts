import {differenceInDays, format, formatDistance} from 'date-fns'
import {it} from 'date-fns/locale'

export function charsToPages(chars: number, charsPerPage = 1800): number {
  return Math.ceil(chars / charsPerPage)
}

export function wordsToReadingTime(words: number, wpm = 250): string {
  const minutes = Math.ceil(words / wpm)
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  const remaining = minutes % 60
  return remaining > 0 ? `${hours}h ${remaining}min` : `${hours}h`
}

export function calcProgress(current: number, target: number): number {
  if (target === 0) return 0
  return Math.min(100, Math.round((current / target) * 100))
}

export function calcProjectedEndDate(
  currentWords: number,
  targetWords: number,
  startDate: string
): string | null {
  const days = differenceInDays(new Date(), new Date(startDate))
  if (days === 0 || currentWords === 0) return null
  const dailyAvg = currentWords / days
  const remaining = targetWords - currentWords
  if (remaining <= 0) return 'Già raggiunto!'
  const daysLeft = Math.ceil(remaining / dailyAvg)
  const projected = new Date()
  projected.setDate(projected.getDate() + daysLeft)
  return format(projected, 'dd MMM yyyy', { locale: it })
}

export function wordsPerDay(currentWords: number, startDate: string): number {
  const days = differenceInDays(new Date(), new Date(startDate))
  if (days === 0) return currentWords
  return Math.round(currentWords / days)
}

export function formatDate(date: string | Date | null, fmt = 'dd MMM yyyy'): string {
  if (!date) return '—'
  try {
    return format(new Date(date), fmt, { locale: it })
  } catch {
    return '—'
  }
}

export function formatRelativeDate(date: string | Date): string {
  try {
    return formatDistance(new Date(date), new Date(), { addSuffix: true, locale: it })
  } catch {
    return '—'
  }
}

export function formatNumber(n: number): string {
  return new Intl.NumberFormat('it-IT').format(n)
}

export function isDueSoon(dueDate: string | null, days = 7): boolean {
  if (!dueDate) return false
  const diff = differenceInDays(new Date(dueDate), new Date())
  return diff >= 0 && diff <= days
}

export function isOverdue(dueDate: string | null): boolean {
  if (!dueDate) return false
  return differenceInDays(new Date(dueDate), new Date()) < 0
}
