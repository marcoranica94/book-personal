/**
 * AI Chapter Analysis Script
 * Eseguito da GitHub Actions con: node analyze-chapter.mjs
 *
 * ENV:
 *   ANTHROPIC_API_KEY           — Chiave API Anthropic (per Claude)
 *   GEMINI_API_KEY              — Chiave API Google Gemini
 *   OPENAI_API_KEY              — Chiave API OpenAI (per ChatGPT)
 *   FIREBASE_SERVICE_ACCOUNT_JSON — Service Account JSON (stringa)
 *   CHAPTER_ID                  — ID capitolo o "all"
 *   AI_PROVIDER                 — "claude" | "gemini" | "chatgpt" (default: "claude")
 *   INCLUDE_PREVIOUS            — "true" per includere analisi precedente
 *   REPO_DIR                    — Path root del repo (per leggere i file .md)
 */

import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import {readFile} from 'fs/promises'
import {join} from 'path'
import {cert, initializeApp} from 'firebase-admin/app'
import {getFirestore} from 'firebase-admin/firestore'

// ─── Init ──────────────────────────────────────────────────────────────────

const CHAPTER_ID = process.env.CHAPTER_ID ?? 'all'
const REPO_DIR = process.env.REPO_DIR ?? '.'
const INCLUDE_PREVIOUS = (process.env.INCLUDE_PREVIOUS ?? 'false') === 'true'
const AI_PROVIDER = process.env.AI_PROVIDER ?? 'claude'

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON)
initializeApp({credential: cert(serviceAccount)})
const db = getFirestore()

// ─── AI Provider Config ─────────────────────────────────────────────────────

const PROVIDER_MODELS = {
  claude: 'claude-sonnet-4-6',
  gemini: 'gemini-2.5-flash',
  chatgpt: 'gpt-4o',
}

// ─── Firestore helpers ──────────────────────────────────────────────────────

async function getChapters() {
  const snap = await db.collection('chapters').orderBy('number').get()
  return snap.docs.map((d) => ({...d.data(), id: d.id}))
}

async function getSettings() {
  const snap = await db.collection('settings').doc('book').get()
  return snap.exists ? snap.data() : {}
}

async function getPreviousAnalysis(chapterId) {
  // Prima prova la subcollection byProvider
  const providerDoc = await db.collection('analyses').doc(chapterId)
    .collection('byProvider').doc(AI_PROVIDER).get()
  if (providerDoc.exists) return providerDoc.data()
  // Fallback: doc root (retrocompatibilità)
  const snap = await db.collection('analyses').doc(chapterId).get()
  return snap.exists ? snap.data() : null
}

async function saveAnalysis(chapterId, analysis) {
  const ref = db.collection('analyses').doc(chapterId)
  // Salva nella subcollection byProvider
  const providerRef = ref.collection('byProvider').doc(AI_PROVIDER)
  await providerRef.set(analysis)
  await providerRef.collection('history').add(analysis)
  // Aggiorna anche il doc root come cache dell'ultima analisi
  await ref.set(analysis)
  // Pulisci eventuali errori precedenti per questo provider
  await db.collection('analysisErrors').doc(`${chapterId}_${AI_PROVIDER}`).delete().catch(() => {})
}

/** Salva un record di errore su Firestore per rendere il fallimento visibile nella UI */
async function saveAnalysisError(chapterId, errorMessage) {
  const errorRecord = {
    chapterId,
    provider: AI_PROVIDER,
    error: errorMessage,
    failedAt: new Date().toISOString(),
    model: PROVIDER_MODELS[AI_PROVIDER] ?? '?',
  }
  // Salva nella subcollection per storico
  await db.collection('analyses').doc(chapterId)
    .collection('byProvider').doc(AI_PROVIDER)
    .collection('errors').doc('latest')
    .set(errorRecord)
  // Salva anche in collection top-level per query facili dalla UI
  await db.collection('analysisErrors').doc(`${chapterId}_${AI_PROVIDER}`).set(errorRecord)
  console.error(`  ✗ Errore salvato su Firestore per ${chapterId}/${AI_PROVIDER}: ${errorMessage}`)
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

function buildPreviousAnalysisContext(prev) {
  if (!prev) return ''

  const parts = []
  parts.push(`--- ANALISI PRECEDENTE (${prev.analyzedAt}) ---`)
  parts.push(`Punteggio complessivo: ${prev.scores?.overall ?? '?'}/10`)
  if (prev.scores) {
    const scoreEntries = Object.entries(prev.scores).filter(([k]) => k !== 'overall')
    parts.push(`Punteggi: ${scoreEntries.map(([k, v]) => `${k}: ${v}`).join(', ')}`)
  }
  if (prev.summary) parts.push(`\nSintesi: ${prev.summary}`)
  if (prev.strengths?.length) parts.push(`\nPunti di forza:\n${prev.strengths.map(s => `  - ${s}`).join('\n')}`)
  if (prev.weaknesses?.length) parts.push(`\nDebolezze segnalate:\n${prev.weaknesses.map(w => `  - ${w}`).join('\n')}`)
  if (prev.suggestions?.length) parts.push(`\nSuggerimenti dati:\n${prev.suggestions.map(s => `  - ${s}`).join('\n')}`)

  // Mostra le correzioni e il loro stato (accettata/rifiutata/ignorata)
  if (prev.corrections?.length) {
    const accepted = new Set(prev.acceptedCorrections ?? [])
    const rejected = new Set(prev.rejectedCorrections ?? [])
    const lines = prev.corrections.map((c, i) => {
      const status = accepted.has(i) ? '✅ ACCETTATA' : rejected.has(i) ? '❌ RIFIUTATA' : '⏳ IGNORATA'
      return `  [${status}] "${c.original}" → "${c.suggested}" (${c.type}: ${c.note})`
    })
    parts.push(`\nCorrezioni proposte e loro esito:\n${lines.join('\n')}`)
  }

  if (prev.historicalAccuracy) {
    parts.push(`\nAccuratezza storica: ${prev.historicalAccuracy.score}/10`)
    if (prev.historicalAccuracy.anachronisms?.length) {
      parts.push(`Anacronismi segnalati: ${prev.historicalAccuracy.anachronisms.join(', ')}`)
    }
  }

  parts.push(`--- FINE ANALISI PRECEDENTE ---`)
  return parts.join('\n')
}

function buildPrompt(bookTitle, bookType, chapterText, previousContext) {
  const isHistorical = bookType === 'storico'
  const personas = READER_PERSONAS[isHistorical ? 'storico' : 'default']

  const historicalSection = isHistorical ? buildHistoricalSection() : ''
  const reactionsSection = buildReaderReactionsSection(personas)

  const previousBlock = previousContext ? `

IMPORTANTE — CONTESTO ANALISI PRECEDENTE:
L'autore ha già ricevuto un'analisi precedente per questo capitolo e ha lavorato sul testo.
Di seguito trovi l'analisi precedente con lo stato delle correzioni (accettate/rifiutate/ignorate dall'autore).
Usa queste informazioni per:
1. Valutare il PROGRESSO rispetto all'analisi precedente
2. Non ripetere correzioni già accettate e applicate (il testo dovrebbe già includerle)
3. Tenere conto delle correzioni rifiutate (l'autore ha scelto consapevolmente di non applicarle)
4. Segnalare se debolezze precedenti sono state risolte o persistono
5. Nella sintesi, includi un breve paragrafo sul progresso rispetto all'analisi precedente

${previousContext}
` : ''

  return `
Sei un editor letterario italiano di alto livello. Analizza il seguente capitolo del libro
intitolato "${bookTitle}" (genere: ${bookType || 'generico'}) e fornisci un'analisi dettagliata e professionale.
${previousBlock}

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
  "weaknesses": [
    {
      "text": "<descrizione del punto debole>",
      "quotes": ["<citazione esatta dal testo che mostra questa debolezza>", ...]
    }
  ],
  "suggestions": [
    {
      "text": "<suggerimento specifico>",
      "quotes": ["<citazione esatta dal testo a cui si applica il suggerimento>", ...]
    }
  ],
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

// ─── AI Provider Calls ───────────────────────────────────────────────────────

async function callClaude(prompt, previousContext) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY non configurata')
  const client = new Anthropic({apiKey})
  const message = await client.messages.create({
    model: PROVIDER_MODELS.claude,
    max_tokens: previousContext ? 8000 : 6000,
    messages: [{role: 'user', content: prompt}],
  })
  const block = message.content[0]
  return block?.type === 'text' ? block.text : ''
}

async function callGemini(prompt, previousContext) {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('GEMINI_API_KEY non configurata')
  const model = PROVIDER_MODELS.gemini
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`
  const res = await fetch(url, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({
      contents: [{parts: [{text: prompt}]}],
      generationConfig: {
        maxOutputTokens: previousContext ? 8000 : 6000,
        temperature: 0.7,
        responseMimeType: 'application/json',
      },
    }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Gemini API error ${res.status}: ${body.substring(0, 300)}`)
  }
  const data = await res.json()
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
  return text
}

async function callChatGPT(prompt, previousContext) {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error('OPENAI_API_KEY non configurata')
  const client = new OpenAI({apiKey})
  const response = await client.chat.completions.create({
    model: PROVIDER_MODELS.chatgpt,
    max_tokens: previousContext ? 8000 : 6000,
    temperature: 0.7,
    response_format: {type: 'json_object'},
    messages: [
      {role: 'system', content: 'Rispondi esclusivamente con JSON valido.'},
      {role: 'user', content: prompt},
    ],
  })
  return response.choices?.[0]?.message?.content ?? ''
}

// ─── Core ────────────────────────────────────────────────────────────────────

async function analyzeChapter(chapter, bookSettings) {
  console.log(`Analizzando [${AI_PROVIDER}]: ${chapter.number} - ${chapter.title}`)

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

  // Contesto analisi precedente (se richiesto)
  let previousContext = ''
  if (INCLUDE_PREVIOUS) {
    const prev = await getPreviousAnalysis(chapter.id)
    if (prev) {
      previousContext = buildPreviousAnalysisContext(prev)
      console.log(`  Inclusa analisi precedente del ${prev.analyzedAt} (accepted: ${prev.acceptedCorrections?.length ?? 0}, rejected: ${prev.rejectedCorrections?.length ?? 0})`)
    } else {
      console.log(`  Nessuna analisi precedente trovata — analisi da zero`)
    }
  }

  const prompt = buildPrompt(bookTitle, bookType, chapterText, previousContext || null)

  const modelName = PROVIDER_MODELS[AI_PROVIDER] ?? PROVIDER_MODELS.claude
  let responseText = ''

  try {
    if (AI_PROVIDER === 'gemini') {
      responseText = await callGemini(prompt, previousContext)
    } else if (AI_PROVIDER === 'chatgpt') {
      responseText = await callChatGPT(prompt, previousContext)
    } else {
      responseText = await callClaude(prompt, previousContext)
    }
  } catch (apiErr) {
    const msg = `Errore chiamata ${AI_PROVIDER}: ${apiErr.message ?? apiErr}`
    console.error(`  ${msg}`)
    await saveAnalysisError(chapter.id, msg)
    return null
  }

  if (!responseText) {
    const msg = `Risposta vuota da ${AI_PROVIDER} (${modelName})`
    console.warn(`  ${msg}`)
    await saveAnalysisError(chapter.id, msg)
    return null
  }

  try {
    const jsonMatch = responseText.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('Nessun JSON nella risposta')
    const parsed = JSON.parse(jsonMatch[0])
    // Rimuovi il placeholder
    delete parsed._placeholder
    return {
      chapterId: chapter.id,
      provider: AI_PROVIDER,
      analyzedAt: new Date().toISOString(),
      model: modelName,
      ...parsed,
    }
  } catch (err) {
    const msg = `Errore parsing JSON per ${chapter.id}: ${err.message}. Response (500 chars): ${responseText.substring(0, 500)}`
    console.error(`  ${msg}`)
    await saveAnalysisError(chapter.id, msg)
    return null
  }
}

async function main() {
  const [chapters, bookSettings] = await Promise.all([getChapters(), getSettings()])
  console.log(`Impostazioni libro: tipo=${bookSettings?.bookType ?? 'generico'}, titolo=${bookSettings?.title ?? '?'}`)
  console.log(`Provider AI: ${AI_PROVIDER} (modello: ${PROVIDER_MODELS[AI_PROVIDER] ?? '?'})`)
  console.log(`Modalità: ${INCLUDE_PREVIOUS ? 'con contesto analisi precedente' : 'analisi da zero'}`)

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
