import {describe, expect, it} from 'vitest'
import {calcProgress, calcProjectedEndDate, charsToPages, formatDate, formatNumber, isDueSoon, isOverdue, wordsPerDay, wordsToReadingTime,} from './formatters'

// ─── charsToPages ─────────────────────────────────────────────────────────────

describe('charsToPages', () => {
  it('arrotonda verso l alto', () => {
    expect(charsToPages(1801)).toBe(2)
  })
  it('esatto', () => {
    expect(charsToPages(1800)).toBe(1)
  })
  it('zero', () => {
    expect(charsToPages(0)).toBe(0)
  })
  it('rispetta charsPerPage custom', () => {
    expect(charsToPages(3000, 1500)).toBe(2)
  })
})

// ─── wordsToReadingTime ───────────────────────────────────────────────────────

describe('wordsToReadingTime', () => {
  it('meno di 60 minuti', () => {
    expect(wordsToReadingTime(500)).toBe('2 min')
  })
  it('esattamente 60 minuti', () => {
    expect(wordsToReadingTime(15000)).toBe('1h')
  })
  it('ore e minuti', () => {
    expect(wordsToReadingTime(16000)).toBe('1h 4min')
  })
  it('arrotonda verso l alto', () => {
    expect(wordsToReadingTime(1)).toBe('1 min')
  })
  it('wpm custom', () => {
    expect(wordsToReadingTime(100, 100)).toBe('1 min')
  })
})

// ─── calcProgress ─────────────────────────────────────────────────────────────

describe('calcProgress', () => {
  it('progresso normale', () => {
    expect(calcProgress(450, 900)).toBe(50)
  })
  it('zero corrente', () => {
    expect(calcProgress(0, 900)).toBe(0)
  })
  it('target zero restituisce zero', () => {
    expect(calcProgress(100, 0)).toBe(0)
  })
  it('supera il 100% viene bloccato a 100', () => {
    expect(calcProgress(2000, 1000)).toBe(100)
  })
  it('esattamente 100%', () => {
    expect(calcProgress(1000, 1000)).toBe(100)
  })
  it('arrotonda', () => {
    expect(calcProgress(1, 3)).toBe(33)
  })
})

// ─── calcProjectedEndDate ────────────────────────────────────────────────────

describe('calcProjectedEndDate', () => {
  it('restituisce null se giorni = 0 (start oggi)', () => {
    const today = new Date().toISOString().slice(0, 10)
    expect(calcProjectedEndDate(500, 10000, today)).toBeNull()
  })
  it('restituisce null se currentWords = 0', () => {
    const pastDate = new Date(Date.now() - 10 * 86400000).toISOString()
    expect(calcProjectedEndDate(0, 10000, pastDate)).toBeNull()
  })
  it('gia raggiunto', () => {
    const pastDate = new Date(Date.now() - 5 * 86400000).toISOString()
    expect(calcProjectedEndDate(10000, 5000, pastDate)).toBe('Già raggiunto!')
  })
  it('restituisce una stringa data valida', () => {
    const pastDate = new Date(Date.now() - 10 * 86400000).toISOString()
    const result = calcProjectedEndDate(1000, 10000, pastDate)
    expect(result).toMatch(/\d{2} \w+ \d{4}/)
  })
})

// ─── wordsPerDay ──────────────────────────────────────────────────────────────

describe('wordsPerDay', () => {
  it('se giorni = 0 restituisce le parole totali', () => {
    const today = new Date().toISOString().slice(0, 10)
    expect(wordsPerDay(300, today)).toBe(300)
  })
  it('media giornaliera', () => {
    const pastDate = new Date(Date.now() - 4 * 86400000).toISOString()
    expect(wordsPerDay(400, pastDate)).toBe(100)
  })
})

// ─── formatDate ───────────────────────────────────────────────────────────────

describe('formatDate', () => {
  it('null restituisce trattino', () => {
    expect(formatDate(null)).toBe('—')
  })
  it('data valida', () => {
    expect(formatDate('2024-01-15')).toMatch(/15 gen 2024/i)
  })
  it('stringa non valida restituisce trattino', () => {
    expect(formatDate('invalid-date')).toBe('—')
  })
})

// ─── formatNumber ─────────────────────────────────────────────────────────────

describe('formatNumber', () => {
  it('zero', () => {
    expect(formatNumber(0)).toBe('0')
  })
  it('restituisce stringa con le cifre corrette', () => {
    // Rimuove separatori per non dipendere dal locale di jsdom
    expect(formatNumber(1000).replace(/\D/g, '')).toBe('1000')
  })
  it('milioni contiene tutte le cifre', () => {
    expect(formatNumber(1234567).replace(/\D/g, '')).toBe('1234567')
  })
})

// ─── isDueSoon ────────────────────────────────────────────────────────────────

describe('isDueSoon', () => {
  it('null restituisce false', () => {
    expect(isDueSoon(null)).toBe(false)
  })
  it('domani rientra nella finestra', () => {
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10)
    expect(isDueSoon(tomorrow)).toBe(true)
  })
  it('oggi rientra', () => {
    const today = new Date().toISOString().slice(0, 10)
    expect(isDueSoon(today)).toBe(true)
  })
  it('tra 10 giorni non rientra', () => {
    const future = new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10)
    expect(isDueSoon(future)).toBe(false)
  })
  it('ieri non rientra (gia scaduto)', () => {
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
    expect(isDueSoon(yesterday)).toBe(false)
  })
  it('finestra custom', () => {
    // Usa 5 giorni avanti per evitare ambiguita da timezone offset
    const in5Days = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10)
    expect(isDueSoon(in5Days, 3)).toBe(false)
    expect(isDueSoon(in5Days, 6)).toBe(true)
  })
})

// ─── isOverdue ────────────────────────────────────────────────────────────────

describe('isOverdue', () => {
  it('null restituisce false', () => {
    expect(isOverdue(null)).toBe(false)
  })
  it('ieri e scaduto', () => {
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
    expect(isOverdue(yesterday)).toBe(true)
  })
  it('domani non e scaduto', () => {
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10)
    expect(isOverdue(tomorrow)).toBe(false)
  })
  it('oggi non e scaduto (diff = 0)', () => {
    const today = new Date().toISOString().slice(0, 10)
    expect(isOverdue(today)).toBe(false)
  })
})
