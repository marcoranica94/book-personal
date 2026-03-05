import {describe, expect, it} from 'vitest'
import {cn} from './cn'

describe('cn', () => {
  it('combina classi semplici', () => {
    expect(cn('a', 'b')).toBe('a b')
  })
  it('ignora valori falsy', () => {
    expect(cn('a', false, null, undefined, 'b')).toBe('a b')
  })
  it('merge tailwind in conflitto — vince lultima', () => {
    expect(cn('p-2', 'p-4')).toBe('p-4')
  })
  it('gestisce oggetti condizionali', () => {
    expect(cn({'text-red-500': true, 'text-blue-500': false})).toBe('text-red-500')
  })
  it('nessun argomento → stringa vuota', () => {
    expect(cn()).toBe('')
  })
})
