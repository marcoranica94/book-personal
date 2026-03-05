import {describe, expect, it} from 'vitest'
import {applyCorrectionsToContent} from './corrections'
import {CorrectionType} from '@/types'

const corrections = [
  {original: 'cane', suggested: 'gatto', type: CorrectionType.STYLE, note: ''},
  {original: 'casa', suggested: 'palazzo', type: CorrectionType.CLARITY, note: ''},
  {original: 'testo non presente', suggested: 'xxx', type: CorrectionType.GRAMMAR, note: ''},
]

describe('applyCorrectionsToContent', () => {
  it('applica la correzione selezionata', () => {
    const {content, applied, notFound} = applyCorrectionsToContent(
      'Il cane è bello',
      corrections,
      new Set([0]),
    )
    expect(content).toBe('Il gatto è bello')
    expect(applied).toBe(1)
    expect(notFound).toHaveLength(0)
  })

  it('applica piu correzioni in ordine indice', () => {
    const {content, applied} = applyCorrectionsToContent(
      'Il cane e la casa',
      corrections,
      new Set([0, 1]),
    )
    expect(content).toBe('Il gatto e la palazzo')
    expect(applied).toBe(2)
  })

  it('segnala testo non trovato', () => {
    const {applied, notFound} = applyCorrectionsToContent(
      'testo qualsiasi',
      corrections,
      new Set([2]),
    )
    expect(applied).toBe(0)
    expect(notFound).toHaveLength(1)
    expect(notFound[0]).toContain('testo non presente')
  })

  it('set vuoto non modifica il contenuto', () => {
    const original = 'testo invariato'
    const {content, applied} = applyCorrectionsToContent(original, corrections, new Set())
    expect(content).toBe(original)
    expect(applied).toBe(0)
  })

  it('indice fuori range viene ignorato', () => {
    const {content, applied} = applyCorrectionsToContent(
      'Il cane',
      corrections,
      new Set([99]),
    )
    expect(content).toBe('Il cane')
    expect(applied).toBe(0)
  })

  it('applica solo la prima occorrenza (String.replace default)', () => {
    const {content, applied} = applyCorrectionsToContent(
      'cane e ancora cane',
      corrections,
      new Set([0]),
    )
    // String.replace senza regex globale sostituisce solo la prima occorrenza
    expect(content).toBe('gatto e ancora cane')
    expect(applied).toBe(1)
  })

  it('risultato parziale se alcune trovate e alcune no', () => {
    const {applied, notFound} = applyCorrectionsToContent(
      'Il cane nella casa',
      corrections,
      new Set([0, 1, 2]),
    )
    expect(applied).toBe(2)
    expect(notFound).toHaveLength(1)
  })
})
