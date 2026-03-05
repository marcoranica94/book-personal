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

async function getSettings() {
  const snap = await db.collection('settings').doc('book').get()
  return snap.exists ? snap.data() : {}
}

async function saveAnalysis(chapterId, analysis) {
  const ref = db.collection('analyses').doc(chapterId)
  await ref.set(analysis)
  await ref.collection('history').add(analysis)
}

// ─── Prompt ─────────────────────────────────────────────────────────────────

const READER_PERSONAS = {
  storico: [
    'Studente liceale (16-18 anni)',
    'Insegnante di storia',
    'Appassionato di storia',
    'Esperto del periodo storico',
    'Lettore occasionale',
  ],
  default: [
    'Lettore abituale',
    'Studente universitario',
    'Critico letterario',
    'Lettore occasionale',
    'Appassionato del genere',
  ],
}

function buildHistoricalSection() {
  return `
  "historicalAccuracy": {
    "score": <1-10, accuratezza storica complessiva>,
    "summary": "<sintesi max 150 parole>",
    "anachronisms": ["<anacronismo 1: parola/oggetto/concetto fuori epoca>", ...],
    "correct": ["<elemento storicamente accurato e rilevante 1>", ...],
    "issues": [
      {
        "quote": "<citazione esatta dal testo>",
        "issue": "<descrizione del problema storico>",
        "suggestion": "<come correggerlo>"
      }
    ]
  },`
}

function buildReaderReactionsSection(personas) {
  const personaList = personas.map(p => `    {"persona": "${p}", "emoji": "<emoji appropriata>", "rating": <1-5>, "reaction": "<frase breve in prima persona>", "questions": ["<domanda 1>", "<domanda 2>"], "comment": "<commento esteso max 80 parole>"}`).join(',\n')
  return `
  "readerReactions": [
${personaList}
  ],`
}

function buildPrompt(bookTitle, bookType, chapterText) {
  const isHistorical = bookType === 'storico'
  const personas = READER_PERSONAS[isHistorical ? 'storico' : 'default']

  const historicalSection = isHistorical ? buildHistoricalSection() : ''
  const reactionsSection = buildReaderReactionsSection(personas)

  return `
Sei un editor letterario italiano di alto livello. Analizza il seguente capitolo del libro
intitolato "${bookTitle}" (genere: ${bookType || 'generico'}) e fornisci un'analisi dettagliata e professionale.

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
  ],${historicalSection}${reactionsSection}
  "_placeholder": null
}

Criteri di valutazione:
- stile: qualità della prosa, varietà lessicale, originalità dello stile
- chiarezza: comprensibilità, coerenza interna, chiarezza delle scene
- ritmo: pacing narrativo, alternanza descrizione/azione/dialogo
- sviluppoPersonaggi: profondità, coerenza e crescita dei personaggi
- trama: coerenza della trama, tensione narrativa, struttura della scena
- originalita: freschezza delle idee, evitare i cliché
${isHistorical ? `
Criteri accuratezza storica (historicalAccuracy):
- Verifica parole, oggetti, tecnologie, usi e costumi coerenti con il periodo
- Segnala anacronismi anche sottili (espressioni moderne, concetti non ancora esistenti)
- Valuta la plausibilità delle situazioni descritte nel contesto storico
` : ''}
--- CAPITOLO ---
${chapterText}
`.trim()
}

// ─── Core ────────────────────────────────────────────────────────────────────

async function analyzeChapter(chapter, bookSettings) {
  console.log(`Analizzando: ${chapter.number} - ${chapter.title}`)

  const bookTitle = bookSettings?.title || chapter.title
  const bookType = bookSettings?.bookType || 'generico'

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

  console.log(`  Sorgente: ${source} (${chapterText.length} chars) | bookType: ${bookType}`)

  const prompt = buildPrompt(bookTitle, bookType, chapterText)

  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 6000,
    messages: [{role: 'user', content: prompt}],
  })

  const rawContent = message.content[0]
  if (rawContent.type !== 'text') return null

  try {
    const jsonMatch = rawContent.text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('Nessun JSON nella risposta')
    const parsed = JSON.parse(jsonMatch[0])
    // Rimuovi il placeholder
    delete parsed._placeholder
    return {
      chapterId: chapter.id,
      analyzedAt: new Date().toISOString(),
      model: 'claude-sonnet-4-6',
      ...parsed,
    }
  } catch (err) {
    console.error(`  Errore parsing JSON per ${chapter.id}:`, err)
    return null
  }
}

async function main() {
  const [chapters, bookSettings] = await Promise.all([getChapters(), getSettings()])
  console.log(`Impostazioni libro: tipo=${bookSettings?.bookType ?? 'generico'}, titolo=${bookSettings?.title ?? '?'}`)

  const toAnalyze =
    CHAPTER_ID === 'all'
      ? chapters
      : chapters.filter((c) => c.id === CHAPTER_ID)

  if (toAnalyze.length === 0) {
    console.log('Nessun capitolo trovato da analizzare.')
    return
  }

  for (const chapter of toAnalyze) {
    const analysis = await analyzeChapter(chapter, bookSettings)
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
