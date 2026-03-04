/**
 * AI Chapter Analysis Script
 * Eseguito da GitHub Actions con: node analyze-chapter.mjs
 *
 * ENV:
 *   ANTHROPIC_API_KEY  — Chiave API Anthropic
 *   CHAPTER_ID         — ID capitolo o "all"
 *   DATA_DIR           — Path assoluto al branch data clonato
 */

import Anthropic from '@anthropic-ai/sdk'
import {mkdir, readFile, writeFile} from 'fs/promises'
import {join} from 'path'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const DATA_DIR = process.env.DATA_DIR ?? './data'
const CHAPTER_ID = process.env.CHAPTER_ID ?? 'all'

async function readJSON(filePath) {
  const content = await readFile(filePath, 'utf-8')
  return JSON.parse(content)
}

async function writeJSON(filePath, data) {
  await mkdir(new URL('.', `file://${filePath}`).pathname, { recursive: true })
  await writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8')
}

const ANALYSIS_PROMPT = (title, chapterText) => `
Sei un editor letterario italiano di alto livello. Analizza il seguente capitolo del libro
intitolato "${title}" e fornisci un'analisi dettagliata e professionale.

Rispondi ESCLUSIVAMENTE con un oggetto JSON valido (nessun testo prima o dopo), con questa struttura:
{
  "scores": {
    "stile": <1-10>,
    "chiarezza": <1-10>,
    "ritmo": <1-10>,
    "sviluppoPersonaggi": <1-10>,
    "trama": <1-10>,
    "originalita": <1-10>,
    "overall": <media pesata 1-10>
  },
  "summary": "<sintesi dell'analisi, max 200 parole>",
  "strengths": ["<punto di forza 1>", "<punto di forza 2>", ...],
  "weaknesses": ["<area di miglioramento 1>", ...],
  "suggestions": ["<suggerimento specifico 1>", ...],
  "corrections": [
    {
      "original": "<testo originale>",
      "suggested": "<testo corretto>",
      "type": "grammar|style|clarity|continuity",
      "note": "<spiegazione breve>"
    }
  ]
}

Criteri di valutazione:
- stile: qualità della prosa, varietà lessicale, originalità dello stile
- chiarezza: comprensibilità, coerenza interna, chiarezza delle scene
- ritmo: pacing narrativo, alternanza descrizione/azione/dialogo
- sviluppoPersonaggi: profondità, coerenza e crescita dei personaggi
- trama: coerenza della trama, tensione narrativa, struttura della scena
- originalita: freschezza delle idee, evitare i cliché

--- CAPITOLO ---
${chapterText}
`.trim()

async function analyzeChapter(chapter) {
  console.log(`Analizzando capitolo: ${chapter.number} - ${chapter.title}`)

  // Prova a leggere il testo del capitolo dal file (se esiste nel branch data)
  let chapterText = chapter.synopsis || ''
  const chapterFilePath = join(DATA_DIR, 'chapters-content', `${chapter.id}.md`)
  try {
    chapterText = await readFile(chapterFilePath, 'utf-8')
  } catch {
    // Usa synopsis come fallback
    if (!chapterText) {
      console.warn(`  Nessun testo trovato per ${chapter.id}, skip.`)
      return null
    }
  }

  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    messages: [
      {
        role: 'user',
        content: ANALYSIS_PROMPT(chapter.title, chapterText),
      },
    ],
  })

  const rawContent = message.content[0]
  if (rawContent.type !== 'text') return null

  let analysisData
  try {
    // Extract JSON from response
    const jsonMatch = rawContent.text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('No JSON found in response')
    analysisData = JSON.parse(jsonMatch[0])
  } catch (err) {
    console.error(`  Errore parsing JSON per ${chapter.id}:`, err)
    return null
  }

  return {
    chapterId: chapter.id,
    analyzedAt: new Date().toISOString(),
    model: 'claude-sonnet-4-6',
    ...analysisData,
  }
}

async function main() {
  const chaptersPath = join(DATA_DIR, 'chapters.json')
  const chapters = await readJSON(chaptersPath)

  const toAnalyze =
    CHAPTER_ID === 'all'
      ? chapters
      : chapters.filter((c) => c.id === CHAPTER_ID)

  if (toAnalyze.length === 0) {
    console.log('Nessun capitolo trovato da analizzare.')
    return
  }

  const analysisDir = join(DATA_DIR, 'analysis')
  const indexPath = join(analysisDir, 'index.json')

  let index = {}
  try {
    index = await readJSON(indexPath)
  } catch {
    // Index non esiste ancora
  }

  for (const chapter of toAnalyze) {
    const analysis = await analyzeChapter(chapter)
    if (!analysis) continue

    const outPath = join(analysisDir, `chapter-${chapter.id}.json`)
    await writeJSON(outPath, analysis)
    index[chapter.id] = analysis.analyzedAt
    console.log(`  ✓ Analisi salvata in ${outPath}`)
  }

  await writeJSON(indexPath, index)
  console.log('Analisi completata.')
}

main().catch((err) => {
  console.error('Errore fatale:', err)
  process.exit(1)
})
