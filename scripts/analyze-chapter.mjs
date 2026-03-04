/**
 * AI Chapter Analysis Script
 * Eseguito da GitHub Actions con: node analyze-chapter.mjs
 *
 * ENV:
 *   ANTHROPIC_API_KEY           — Chiave API Anthropic
 *   FIREBASE_SERVICE_ACCOUNT_JSON — Service Account JSON (stringa)
 *   CHAPTER_ID                  — ID capitolo o "all"
 *   REPO_DIR                    — Path root del repo (per leggere i file .md)
 */

import Anthropic from '@anthropic-ai/sdk'
import {readFile} from 'fs/promises'
import {join} from 'path'
import {cert, initializeApp} from 'firebase-admin/app'
import {getFirestore} from 'firebase-admin/firestore'

// ─── Init ──────────────────────────────────────────────────────────────────

const client = new Anthropic({apiKey: process.env.ANTHROPIC_API_KEY})
const CHAPTER_ID = process.env.CHAPTER_ID ?? 'all'
const REPO_DIR = process.env.REPO_DIR ?? '.'

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON)
initializeApp({credential: cert(serviceAccount)})
const db = getFirestore()

// ─── Firestore helpers ──────────────────────────────────────────────────────

async function getChapters() {
  const snap = await db.collection('chapters').orderBy('number').get()
  return snap.docs.map((d) => ({...d.data(), id: d.id}))
}

async function saveAnalysis(chapterId, analysis) {
  const ref = db.collection('analyses').doc(chapterId)
  await ref.set(analysis)
  await ref.collection('history').add(analysis)
}

// ─── Prompt ─────────────────────────────────────────────────────────────────

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

// ─── Core ────────────────────────────────────────────────────────────────────

async function analyzeChapter(chapter) {
  console.log(`Analizzando: ${chapter.number} - ${chapter.title}`)

  // Priorità sorgente testo:
  // 1. driveContent (testo sincronizzato da Drive, salvato su Firestore)
  // 2. chapters-content/{id}.md (file nel repo)
  // 3. synopsis (fallback minimo)
  let chapterText = ''
  let source = ''

  if (chapter.driveContent && chapter.driveContent.trim().length > 50) {
    chapterText = chapter.driveContent
    source = 'driveContent (Firestore)'
  } else {
    const mdPath = join(REPO_DIR, 'chapters-content', `${chapter.id}.md`)
    try {
      chapterText = await readFile(mdPath, 'utf-8')
      source = mdPath
    } catch {
      chapterText = chapter.synopsis || ''
      source = 'synopsis (fallback)'
    }
  }

  if (!chapterText.trim()) {
    console.warn(`  Nessun testo trovato per ${chapter.id}, skip.`)
    return null
  }

  console.log(`  Sorgente: ${source} (${chapterText.length} chars)`)

  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    messages: [{role: 'user', content: ANALYSIS_PROMPT(chapter.title, chapterText)}],
  })

  const rawContent = message.content[0]
  if (rawContent.type !== 'text') return null

  try {
    const jsonMatch = rawContent.text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('Nessun JSON nella risposta')
    return {
      chapterId: chapter.id,
      analyzedAt: new Date().toISOString(),
      model: 'claude-sonnet-4-6',
      ...JSON.parse(jsonMatch[0]),
    }
  } catch (err) {
    console.error(`  Errore parsing JSON per ${chapter.id}:`, err)
    return null
  }
}

async function main() {
  const chapters = await getChapters()

  const toAnalyze =
    CHAPTER_ID === 'all'
      ? chapters
      : chapters.filter((c) => c.id === CHAPTER_ID)

  if (toAnalyze.length === 0) {
    console.log('Nessun capitolo trovato da analizzare.')
    return
  }

  for (const chapter of toAnalyze) {
    const analysis = await analyzeChapter(chapter)
    if (!analysis) continue
    await saveAnalysis(chapter.id, analysis)
    console.log(`  ✓ Analisi salvata su Firestore (analyses/${chapter.id})`)
  }

  console.log('Analisi completata.')
}

main().catch((err) => {
  console.error('Errore fatale:', err)
  process.exit(1)
})
