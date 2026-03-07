/**
 * Paragraph Formatting Script
 * Eseguito da GitHub Actions con: node format-paragraphs.mjs
 *
 * Legge il testo di un capitolo da Firestore (driveContent), chiede all'IA
 * di riformattare i paragrafi nei punti giusti, e salva il risultato in:
 *   /paragraphReformats/{chapterId}
 *
 * ENV:
 *   ANTHROPIC_API_KEY           — Chiave API Anthropic (per Claude)
 *   GEMINI_API_KEY              — Chiave API Google Gemini
 *   OPENAI_API_KEY              — Chiave API OpenAI
 *   FIREBASE_SERVICE_ACCOUNT_JSON — Service Account JSON (stringa)
 *   CHAPTER_ID                  — ID capitolo (non supporta "all")
 *   AI_PROVIDER                 — "claude" | "gemini" | "chatgpt" (default: "claude")
 *   REPO_DIR                    — Path root del repo (per leggere i file .md)
 */

import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import {readFile} from 'fs/promises'
import {join} from 'path'
import {cert, initializeApp} from 'firebase-admin/app'
import {getFirestore} from 'firebase-admin/firestore'

// ─── Init ──────────────────────────────────────────────────────────────────

const CHAPTER_ID = process.env.CHAPTER_ID
if (!CHAPTER_ID || CHAPTER_ID === 'all') {
  console.error('CHAPTER_ID deve essere un ID capitolo specifico (non "all")')
  process.exit(1)
}

const REPO_DIR = process.env.REPO_DIR ?? '.'
const AI_PROVIDER = process.env.AI_PROVIDER ?? 'claude'

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON)
initializeApp({credential: cert(serviceAccount)})
const db = getFirestore()

// ─── Models ─────────────────────────────────────────────────────────────────

const PROVIDER_MODELS = {
  claude: 'claude-sonnet-4-6',
  gemini: 'gemini-3.1-flash-lite-preview',
  chatgpt: 'gpt-4o',
}

const API_TIMEOUT_MS = {
  claude: 15 * 60 * 1000,
  gemini: 30 * 60 * 1000,
  chatgpt: 15 * 60 * 1000,
}

// ─── Firestore helpers ──────────────────────────────────────────────────────

async function getChapter(chapterId) {
  const snap = await db.collection('chapters').doc(chapterId).get()
  if (!snap.exists) throw new Error(`Capitolo ${chapterId} non trovato`)
  return {...snap.data(), id: snap.id}
}

async function getSettings() {
  const snap = await db.collection('settings').doc('book').get()
  return snap.exists ? snap.data() : {}
}

async function saveReformat(chapterId, reformat) {
  await db.collection('paragraphReformats').doc(chapterId).set(reformat)
  console.log(`  ✓ Riformattazione salvata su Firestore (paragraphReformats/${chapterId})`)
}

async function saveReformatError(chapterId, errorMessage) {
  await db.collection('paragraphReformatErrors').doc(chapterId).set({
    chapterId,
    provider: AI_PROVIDER,
    error: errorMessage,
    failedAt: new Date().toISOString(),
    model: PROVIDER_MODELS[AI_PROVIDER] ?? '?',
  })
  console.error(`  ✗ Errore riformattazione salvato per ${chapterId}: ${errorMessage}`)
}

// ─── Prompt ─────────────────────────────────────────────────────────────────

function buildPrompt(bookTitle, bookType, chapterText) {
  return `
Sei un editor letterario italiano esperto di narrativa (genere: ${bookType || 'generico'}).
Il tuo compito è riformattare il testo del capitolo del libro "${bookTitle}" gestendo i paragrafi nei punti giusti.

REGOLE DA SEGUIRE:
1. NON modificare nessuna parola del testo — solo aggiungi/rimuovi andate a capo (\n\n tra paragrafi)
2. Ogni cambio di scena, cambio di prospettiva, cambio di tempo o di interlocutore deve avere il proprio paragrafo
3. Blocchi di testo densi (> 6-8 frasi) devono essere suddivisi nel punto narrativamente più naturale
4. Dialoghi: ogni battuta di un interlocutore diverso va su una riga separata
5. Azioni brevi e decisive possono stare in paragrafi brevissimi (1-2 frasi) per dare ritmo
6. Non unire paragrafi già corretti troppo brevi — solo se la separazione spezza un'unica idea logica
7. Preserva SEMPRE eventuali titoletti di sezione (es. "---", "* * *", "## …") e frontmatter YAML

Restituisci SOLO il testo riformattato, senza spiegazioni, senza JSON, senza commenti.
Alla fine del testo, su una riga separata, aggiungi ESATTAMENTE questo formato:
---RIEPILOGO---
Paragrafi modificati: <numero intero>
Riepilogo: <max 60 parole che descrivono i principali cambiamenti>

--- TESTO ORIGINALE ---
${chapterText}
`.trim()
}

// ─── AI Provider Calls ───────────────────────────────────────────────────────

async function callClaude(prompt) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY non configurata')
  const client = new Anthropic({apiKey, timeout: API_TIMEOUT_MS.claude})
  const message = await client.messages.create({
    model: PROVIDER_MODELS.claude,
    max_tokens: 16000,
    messages: [{role: 'user', content: prompt}],
  })
  const block = message.content[0]
  return block?.type === 'text' ? block.text : ''
}

async function callGemini(prompt) {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('GEMINI_API_KEY non configurata')
  const model = PROVIDER_MODELS.gemini
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`
  const res = await fetch(url, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({
      contents: [{parts: [{text: prompt}]}],
      generationConfig: {maxOutputTokens: 16000, temperature: 0.2},
    }),
    signal: AbortSignal.timeout(API_TIMEOUT_MS.gemini),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Gemini API error ${res.status}: ${body.substring(0, 300)}`)
  }
  const data = await res.json()
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
}

async function callChatGPT(prompt) {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error('OPENAI_API_KEY non configurata')
  const client = new OpenAI({apiKey, timeout: API_TIMEOUT_MS.chatgpt})
  const response = await client.chat.completions.create({
    model: PROVIDER_MODELS.chatgpt,
    max_tokens: 16000,
    temperature: 0.2,
    messages: [
      {role: 'system', content: 'Sei un editor letterario italiano. Segui le istruzioni dell\'utente alla lettera.'},
      {role: 'user', content: prompt},
    ],
  })
  return response.choices?.[0]?.message?.content ?? ''
}

// ─── Parse response ──────────────────────────────────────────────────────────

function parseResponse(responseText) {
  const summaryMarker = '---RIEPILOGO---'
  const markerIdx = responseText.lastIndexOf(summaryMarker)

  let reformattedText = responseText
  let changesSummary = 'Riformattazione completata'
  let paragraphsChanged = 0

  if (markerIdx !== -1) {
    reformattedText = responseText.slice(0, markerIdx).trim()
    const summaryBlock = responseText.slice(markerIdx + summaryMarker.length).trim()

    const changedMatch = summaryBlock.match(/Paragrafi modificati:\s*(\d+)/i)
    if (changedMatch) paragraphsChanged = parseInt(changedMatch[1], 10)

    const summaryMatch = summaryBlock.match(/Riepilogo:\s*(.+)/is)
    if (summaryMatch) changesSummary = summaryMatch[1].trim().slice(0, 300)
  }

  return {reformattedText, changesSummary, paragraphsChanged}
}

// ─── Core ────────────────────────────────────────────────────────────────────

async function main() {
  const [chapter, bookSettings] = await Promise.all([getChapter(CHAPTER_ID), getSettings()])

  // Sovrascrivi modelli con quelli scelti dall'utente
  if (bookSettings?.claudeModel) PROVIDER_MODELS.claude = bookSettings.claudeModel
  if (bookSettings?.geminiModel) PROVIDER_MODELS.gemini = bookSettings.geminiModel

  const bookTitle = bookSettings?.title || chapter.title
  const bookType = bookSettings?.bookType || 'generico'
  const modelName = PROVIDER_MODELS[AI_PROVIDER] ?? PROVIDER_MODELS.claude

  console.log(`Riformattazione paragrafi: ${chapter.number} - ${chapter.title}`)
  console.log(`Provider: ${AI_PROVIDER} (modello: ${modelName}) | bookType: ${bookType}`)

  // Leggi il testo del capitolo
  let chapterText = ''
  if (chapter.driveContent && chapter.driveContent.trim().length > 50) {
    chapterText = chapter.driveContent
    console.log(`  Sorgente: driveContent Firestore (${chapterText.length} chars)`)
  } else {
    const mdPath = join(REPO_DIR, 'chapters-content', `${chapter.id}.md`)
    try {
      chapterText = await readFile(mdPath, 'utf-8')
      console.log(`  Sorgente: ${mdPath} (${chapterText.length} chars)`)
    } catch {
      chapterText = chapter.synopsis || ''
      console.log(`  Sorgente: synopsis (fallback, ${chapterText.length} chars)`)
    }
  }

  if (!chapterText.trim()) {
    const msg = `Nessun testo trovato per il capitolo ${CHAPTER_ID}`
    console.error(msg)
    await saveReformatError(CHAPTER_ID, msg)
    process.exit(1)
  }

  const prompt = buildPrompt(bookTitle, bookType, chapterText)
  console.log(`  Prompt pronto (${prompt.length} chars) — chiamo ${AI_PROVIDER}…`)

  let responseText = ''
  try {
    if (AI_PROVIDER === 'gemini') {
      responseText = await callGemini(prompt)
    } else if (AI_PROVIDER === 'chatgpt') {
      responseText = await callChatGPT(prompt)
    } else {
      responseText = await callClaude(prompt)
    }
  } catch (err) {
    const msg = `Errore chiamata ${AI_PROVIDER}: ${err.message ?? err}`
    console.error(`  ${msg}`)
    await saveReformatError(CHAPTER_ID, msg)
    process.exit(1)
  }

  if (!responseText || responseText.trim().length < 50) {
    const msg = `Risposta vuota o troppo corta da ${AI_PROVIDER} (${modelName})`
    console.error(`  ${msg}`)
    await saveReformatError(CHAPTER_ID, msg)
    process.exit(1)
  }

  const {reformattedText, changesSummary, paragraphsChanged} = parseResponse(responseText)

  const result = {
    chapterId: CHAPTER_ID,
    provider: AI_PROVIDER,
    model: modelName,
    reformattedAt: new Date().toISOString(),
    reformattedText,
    changesSummary,
    paragraphsChanged,
  }

  await saveReformat(CHAPTER_ID, result)
  console.log(`  Paragrafi modificati: ${paragraphsChanged}`)
  console.log(`  Riepilogo: ${changesSummary}`)
  console.log('Riformattazione completata.')
}

main().catch((err) => {
  console.error('Errore fatale:', err)
  process.exit(1)
})
