import type {AnalysisCorrection} from '@/types'

export function applyCorrectionsToContent(
  content: string,
  corrections: AnalysisCorrection[],
  selected: Set<number>,
): {content: string; applied: number; notFound: string[]} {
  let result = content
  let applied = 0
  const notFound: string[] = []
  for (const idx of Array.from(selected).sort((a, b) => a - b)) {
    const c = corrections[idx]
    if (!c) continue
    if (result.includes(c.original)) {
      result = result.replace(c.original, c.suggested)
      applied++
    } else {
      notFound.push(c.original.slice(0, 40))
    }
  }
  return {content: result, applied, notFound}
}
