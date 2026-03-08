/**
 * AI Character Analysis Script
 * Eseguito da GitHub Actions con: node analyze-character.mjs
 *
 * ENV:
 *   ANTHROPIC_API_KEY           — Chiave API Anthropic (per Claude)
 *   GEMINI_API_KEY              — Chiave API Google Gemini
 *   OPENAI_API_KEY              — Chiave API OpenAI (per ChatGPT)
 *   FIREBASE_SERVICE_ACCOUNT_JSON — Service Account JSON (stringa)
 *   CHARACTER_ID                — ID personaggio da analizzare
 *   AI_PROVIDER                 — "claude" | "gemini" | "chatgpt" (default: "claude")
 *   REPO_DIR                    — Path root del repo (per leggere i file .md)
 */

import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import {jsonrepair} from 'jsonrepair'
import {readFile} from 'fs/promises'
import {join} from 'path'
import {cert, initializeApp} from 'firebase-admin/app'
import {getFirestore} from 'firebase-admin/firestore'

// ─── Init ──────────────────────────────────────────────────────────────────

const CHARACTER_ID = process.env.CHARACTER_ID
if (!CHARACTER_ID) { console.error('CHARACTER_ID non impostato'); process.exit(1) }

const REPO_DIR = process.env.REPO_DIR ?? '.'
const AI_PROVIDER = process.env.AI_PROVIDER ?? 'claude'
const AUTHOR_COMMENT = (process.env.AUTHOR_COMMENT ?? '').trim()

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON)
initializeApp({credential: cert(serviceAccount)})
const db = getFirestore()

const PROVIDER_MODELS = {
  claude: 'claude-sonnet-4-6',
  gemini: 'gemini-2.0-flash-lite',
  chatgpt: 'gpt-4o',
}

const API_TIMEOUT_MS = {claude: 120_000, gemini: 180_000, chatgpt: 120_000}

// ─── Firestore helpers ─────────────────────────────────────────────────────

async function getCharacter(id) {
  const snap = await db.collection('characters').doc(id).get()
  if (!snap.exists) throw new Error(`Personaggio ${id} non trovato su Firestore`)
  return {id: snap.id, ...snap.data()}
}

async function getChapters() {
  const snap = await db.collection('chapters').get()
  return snap.docs.map((d) => ({id: d.id, ...d.data()}))
}

async function getSettings() {
  const snap = await db.collection('settings').doc('book').get()
  return snap.exists ? snap.data() : {}
}

async function saveAnalysis(characterId, analysis) {
  const ref = db.collection('characterAnalyses').doc(characterId)
  const providerRef = ref.collection('byProvider').doc(AI_PROVIDER)
  await providerRef.set(analysis)
  await providerRef.collection('history').add(analysis)
  // Aggiorna lastAnalyzedAt sul personaggio
  await db.collection('characters').doc(characterId).update({
    lastAnalyzedAt: analysis.analyzedAt,
    updatedAt: analysis.analyzedAt,
  })
  // Pulisci errori precedenti
  await ref.collection('byProvider').doc(AI_PROVIDER).collection('errors').doc('latest').delete().catch(() => {})
}

async function saveError(characterId, errorMessage) {
  const errorRecord = {
    characterId,
    provider: AI_PROVIDER,
    error: errorMessage,
    failedAt: new Date().toISOString(),
    model: PROVIDER_MODELS[AI_PROVIDER] ?? '?',
  }
  await db.collection('characterAnalyses').doc(characterId)
    .collection('byProvider').doc(AI_PROVIDER)
    .collection('errors').doc('latest')
    .set(errorRecord)
  console.error(`  ✗ Errore salvato su Firestore per character/${characterId}/${AI_PROVIDER}: ${errorMessage}`)
}

// ─── Timeout fetch ─────────────────────────────────────────────────────────

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, {...options, signal: controller.signal})
  } finally {
    clearTimeout(timer)
  }
}

// ─── Chapter text loading ──────────────────────────────────────────────────

async function getChapterText(chapter) {
  if (chapter.driveContent && chapter.driveContent.trim().length > 50) {
    return {text: chapter.driveContent, source: 'driveContent'}
  }
  const mdPath = join(REPO_DIR, 'chapters-content', `${chapter.id}.md`)
  try {
    const text = await readFile(mdPath, 'utf-8')
    return {text, source: mdPath}
  } catch {
    return {text: chapter.synopsis || '', source: 'synopsis (fallback)'}
  }
}

// ─── Prompt ───────────────────────────────────────────────────────────────

function buildCharacterPrompt(bookTitle, bookType, character, chaptersData, authorComment) {
  const chaptersText = chaptersData.map(({chapter, text}) =>
    `=== CAPITOLO ${chapter.number}: "${chapter.title}" ===\n${text}`
  ).join('\n\n')

  const traitsText = character.personalityTraits?.length
    ? `\nTratti noti: ${character.personalityTraits.join(', ')}`
    : ''
  const backstoryText = character.backstory ? `\nBackstory: ${character.backstory}` : ''
  const motivationText = character.motivation ? `\nMotivazione: ${character.motivation}` : ''
  const aliasesText = character.aliases?.length ? `\nAlias/soprannomi: ${character.aliases.join(', ')}` : ''
  const authorBlock = authorComment ? `\nNOTA DELL'AUTORE: "${authorComment}"\n` : ''

  return `Sei un editor letterario italiano di alto livello. Analizza il personaggio "${character.name}" nel libro "${bookTitle}" (genere: ${bookType || 'generico'}).

DATI PERSONAGGIO:
- Nome: ${character.name}
- Ruolo: ${character.role}${aliasesText}${traitsText}${backstoryText}${motivationText}
${authorBlock}
Di seguito trovi il testo dei capitoli in cui appare (${chaptersData.length} capitoli).

Analizza:
1. La COERENZA del personaggio tra i capitoli (comportamento, tratti, voce)
2. La PROFONDITÀ e complessità psicologica
3. Lo SVILUPPO e l'arco narrativo
4. La CHIAREZZA delle motivazioni
5. L'ORIGINALITÀ rispetto ai cliché del genere

Rispondi ESCLUSIVAMENTE con un oggetto JSON valido:
{
  "scores": {
    "consistency": <1-10, coerenza tra capitoli>,
    "depth": <1-10, profondità psicologica>,
    "development": <1-10, sviluppo/arco del personaggio>,
    "motivation": <1-10, chiarezza delle motivazioni>,
    "uniqueness": <1-10, originalità>,
    "overall": <media pesata 1-10>
  },
  "overview": "<panoramica del personaggio, max 200 parole>",
  "arc": "<descrizione dell'arco narrativo del personaggio, max 150 parole>",
  "strengths": ["<punto di forza 1>", "<punto di forza 2>", ...],
  "weaknesses": ["<debolezza 1>", "<debolezza 2>", ...],
  "consistencyIssues": [
    {
      "chapterId": "<id capitolo o null>",
      "chapterTitle": "<titolo capitolo o null>",
      "issue": "<descrizione del problema di coerenza>"
    }
  ],
  "suggestions": ["<suggerimento per sviluppare meglio il personaggio 1>", ...],
  "chaptersBreakdown": [
    {
      "chapterId": "<id>",
      "chapterTitle": "<titolo>",
      "role": "<ruolo in questo capitolo: protagonista/antagonista/secondario/comprimario>",
      "summary": "<come si comporta/cosa fa in questo capitolo, max 80 parole>"
    }
  ],
  "_placeholder": null
}

CAPITOLI:
${chaptersText}`.trim()
}

// ─── AI calls ─────────────────────────────────────────────────────────────

async function callClaude(prompt) {
  const client = new Anthropic({apiKey: process.env.ANTHROPIC_API_KEY, timeout: API_TIMEOUT_MS.claude})
  const msg = await client.messages.create({
    model: PROVIDER_MODELS.claude,
    max_tokens: 8000,
    messages: [{role: 'user', content: prompt}],
  })
  return msg.content[0]?.type === 'text' ? msg.content[0].text : ''
}

async function callGemini(prompt, retryCount = 0) {
  const model = PROVIDER_MODELS.gemini
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`
  let res
  try {
    res = await fetchWithTimeout(url, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        contents: [{parts: [{text: prompt}]}],
        generationConfig: {maxOutputTokens: 8000, temperature: 0.7, responseMimeType: 'application/json'},
      }),
    }, API_TIMEOUT_MS.gemini)
  } catch (err) {
    if (err.name === 'AbortError' && retryCount === 0) {
      PROVIDER_MODELS.gemini = 'gemini-2.0-flash'
      try { return await callGemini(prompt, 1) } finally { PROVIDER_MODELS.gemini = model }
    }
    throw err
  }
  if (!res.ok) { const b = await res.text(); throw new Error(`Gemini ${res.status}: ${b.slice(0, 200)}`) }
  return (await res.json()).candidates?.[0]?.content?.parts?.[0]?.text ?? ''
}

async function callChatGPT(prompt) {
  const client = new OpenAI({apiKey: process.env.OPENAI_API_KEY, timeout: API_TIMEOUT_MS.chatgpt})
  const resp = await client.chat.completions.create({
    model: PROVIDER_MODELS.chatgpt,
    max_tokens: 8000,
    temperature: 0.7,
    response_format: {type: 'json_object'},
    messages: [{role: 'system', content: 'Rispondi esclusivamente con JSON valido.'}, {role: 'user', content: prompt}],
  })
  return resp.choices?.[0]?.message?.content ?? ''
}

// ─── JSON parsing (same robustness as analyze-chapter) ────────────────────

function parseAIResponse(responseText, characterId) {
  const jsonMatch = responseText.match(/\{[\s\S]*/)
  if (!jsonMatch) throw new Error('Nessun JSON nella risposta')

  let jsonStr = jsonMatch[0]
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')

  try {
    return JSON.parse(jsonStr)
  } catch {
    try {
      console.warn('  JSON malformato, provo jsonrepair…')
      const repaired = jsonrepair(jsonStr)
      const result = JSON.parse(repaired)
      console.warn('  ✓ JSON riparato')
      return result
    } catch (repairErr) {
      throw new Error(`JSON non parsabile: ${repairErr.message}`)
    }
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────

async function main() {
  const [character, chapters, settings] = await Promise.all([
    getCharacter(CHARACTER_ID),
    getChapters(),
    getSettings(),
  ])

  const bookTitle = settings?.title || 'Senza titolo'
  const bookType = settings?.bookType || 'generico'
  const modelName = PROVIDER_MODELS[AI_PROVIDER] ?? PROVIDER_MODELS.claude

  console.log(`Analizzando personaggio: "${character.name}" (${character.role})`)
  console.log(`Libro: "${bookTitle}" (${bookType}) | Provider: ${AI_PROVIDER} (${modelName})`)

  // Raccogli testi dei capitoli dove appare il personaggio
  const appearances = character.chaptersAppearing ?? []
  console.log(`Capitoli con apparizioni: ${appearances.length}`)

  if (appearances.length === 0) {
    console.warn('Nessun capitolo registrato per questo personaggio. Uso tutti i capitoli.')
    // Fallback: usa tutti i capitoli (ordinati per numero)
    const allChapters = chapters.sort((a, b) => (a.number ?? 0) - (b.number ?? 0))
    appearances.push(...allChapters.map((c) => ({chapterId: c.id, chapterTitle: c.title})))
  }

  const chaptersData = []
  for (const app of appearances) {
    const chapter = chapters.find((c) => c.id === app.chapterId)
    if (!chapter) { console.warn(`  Capitolo ${app.chapterId} non trovato, skip.`); continue }
    const {text, source} = await getChapterText(chapter)
    if (!text.trim()) { console.warn(`  Nessun testo per capitolo ${app.chapterId}, skip.`); continue }
    console.log(`  Cap. ${chapter.number} "${chapter.title}": ${text.length} chars da ${source}`)
    chaptersData.push({chapter, text})
  }

  if (chaptersData.length === 0) {
    await saveError(CHARACTER_ID, 'Nessun testo capitolo disponibile per analizzare il personaggio.')
    return
  }

  const prompt = buildCharacterPrompt(bookTitle, bookType, character, chaptersData, AUTHOR_COMMENT)
  console.log(`  Prompt: ~${Math.round(prompt.length / 4)} token stimati`)

  let responseText = ''
  try {
    if (AI_PROVIDER === 'gemini') responseText = await callGemini(prompt)
    else if (AI_PROVIDER === 'chatgpt') responseText = await callChatGPT(prompt)
    else responseText = await callClaude(prompt)
  } catch (err) {
    await saveError(CHARACTER_ID, `Errore API ${AI_PROVIDER}: ${err.message}`)
    return
  }

  if (!responseText) {
    await saveError(CHARACTER_ID, `Risposta vuota da ${AI_PROVIDER}`)
    return
  }

  try {
    const parsed = parseAIResponse(responseText, CHARACTER_ID)
    delete parsed._placeholder

    const analysis = {
      characterId: CHARACTER_ID,
      characterName: character.name,
      provider: AI_PROVIDER,
      analyzedAt: new Date().toISOString(),
      model: modelName,
      ...parsed,
    }

    await saveAnalysis(CHARACTER_ID, analysis)
    console.log(`  ✓ Analisi salvata su Firestore (characterAnalyses/${CHARACTER_ID})`)
    console.log(`  Score complessivo: ${analysis.scores?.overall ?? '?'}/10`)
    console.log(`  Problemi coerenza: ${analysis.consistencyIssues?.length ?? 0}`)
  } catch (err) {
    await saveError(CHARACTER_ID, `Errore parsing: ${err.message}`)
  }

  console.log('Analisi personaggio completata.')
}

main().catch((err) => {
  console.error('Errore fatale:', err)
  process.exit(1)
})
