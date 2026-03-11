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
import {jsonrepair} from 'jsonrepair'
import {readFile} from 'fs/promises'
import {join} from 'path'
import {cert, initializeApp} from 'firebase-admin/app'
import {getFirestore} from 'firebase-admin/firestore'

// ─── Init ──────────────────────────────────────────────────────────────────

const CHAPTER_ID = process.env.CHAPTER_ID ?? 'all'
const REPO_DIR = process.env.REPO_DIR ?? '.'
const INCLUDE_PREVIOUS = (process.env.INCLUDE_PREVIOUS ?? 'false') === 'true'
const AI_PROVIDER = process.env.AI_PROVIDER ?? 'claude'
const AUTHOR_COMMENT = (process.env.AUTHOR_COMMENT ?? '').trim()
/** Domanda precisa dell'autore — se impostata, esegue analisi mirata invece di quella standard */
const CUSTOM_QUESTION = (process.env.CUSTOM_QUESTION ?? '').trim()
/** Se true, l'IA includerà la soluzione proposta per ogni debolezza */
const WITH_WEAKNESS_SOLUTIONS = (process.env.WITH_WEAKNESS_SOLUTIONS ?? 'true') === 'true'
/** Se true, l'IA includerà la soluzione proposta per ogni suggerimento */
const WITH_SUGGESTION_SOLUTIONS = (process.env.WITH_SUGGESTION_SOLUTIONS ?? 'true') === 'true'
/** Se true, l'IA analizzerà anche l'uso dei paragrafi (a capo) */
const WITH_PARAGRAPH_ANALYSIS = (process.env.WITH_PARAGRAPH_ANALYSIS ?? 'false') === 'true'
// Sezioni da includere nell'analisi (tutte abilitate di default per retrocompatibilità)
const WITH_STRENGTHS = (process.env.WITH_STRENGTHS ?? 'true') === 'true'
const WITH_WEAKNESSES = (process.env.WITH_WEAKNESSES ?? 'true') === 'true'
const WITH_SUGGESTIONS = (process.env.WITH_SUGGESTIONS ?? 'true') === 'true'
const WITH_CORRECTIONS = (process.env.WITH_CORRECTIONS ?? 'true') === 'true'
const WITH_READER_REACTIONS = (process.env.WITH_READER_REACTIONS ?? 'true') === 'true'
/** Se true, calcola la frequenza delle parole del capitolo (no AI, puro JS) */
const WITH_WORD_FREQUENCY = (process.env.WITH_WORD_FREQUENCY ?? 'false') === 'true'
/** Se true, analizza i casi di "telling" invece di "showing" con riscritture proposte */
const WITH_SHOW_DONT_TELL = (process.env.WITH_SHOW_DONT_TELL ?? 'false') === 'true'
/** Se true, estrae i personaggi presenti nel capitolo e aggiorna /characters su Firestore */
const WITH_CHARACTERS = (process.env.WITH_CHARACTERS ?? 'false') === 'true'
/** Se true, analizza la coerenza dei tempi verbali e aggiunge correzioni di tipo verb_tense */
const WITH_VERB_TENSE = (process.env.WITH_VERB_TENSE ?? 'false') === 'true'

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON)
initializeApp({credential: cert(serviceAccount)})
const db = getFirestore()

// ─── AI Provider Config ─────────────────────────────────────────────────────

// Default models — sovrascritti da bookSettings.claudeModel / geminiModel
const PROVIDER_MODELS = {
  claude: 'claude-sonnet-4-6',
  gemini: 'gemini-3.1-flash-lite-preview',
  chatgpt: 'gpt-4o',
}

// Timeout per ogni chiamata API (ms)
const API_TIMEOUT_MS = {
  claude: 15 * 60 * 1000,   // 15 minuti
  gemini: 30 * 60 * 1000,   // 30 minuti (Gemini è più lento con output grandi)
  chatgpt: 15 * 60 * 1000,  // 15 minuti
}

/** Wrapper fetch con AbortController timeout */
async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, {...options, signal: controller.signal})
  } finally {
    clearTimeout(timer)
  }
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

/** Upsert personaggi estratti dall'analisi nella collection /characters */
async function upsertCharacters(chapterId, chapterTitle, characters) {
  const snap = await db.collection('characters').get()
  const existing = snap.docs.map((d) => ({id: d.id, ...d.data()}))

  for (const c of characters) {
    const match = existing.find((e) => e.name?.toLowerCase().trim() === c.name?.toLowerCase().trim())
    const appearance = {
      chapterId,
      chapterTitle,
      role: c.role ?? 'secondary',
      description: c.description ?? '',
      keyMoments: c.keyMoments ?? [],
    }

    if (match) {
      const appearances = (match.chaptersAppearing ?? []).filter((a) => a.chapterId !== chapterId)
      appearances.push(appearance)
      await db.collection('characters').doc(match.id).update({
        chaptersAppearing: appearances,
        updatedAt: new Date().toISOString(),
      })
      console.log(`  → Personaggio aggiornato: "${c.name}"`)
    } else {
      await db.collection('characters').add({
        name: c.name,
        aliases: [],
        role: c.role ?? 'secondary',
        age: '',
        physicalDescription: '',
        personalityTraits: [],
        backstory: '',
        motivation: '',
        chaptersAppearing: [appearance],
        notes: '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        extractedFromAnalysis: true,
      })
      console.log(`  → Nuovo personaggio creato: "${c.name}"`)
    }
  }
}

/**
 * Sanitizza ricorsivamente un oggetto per Firestore:
 * - Rimuove chiavi vuote ('')
 * - Converte undefined → null
 * - Rimuove valori non serializzabili
 */
function sanitizeForFirestore(obj) {
  if (Array.isArray(obj)) {
    return obj.map(sanitizeForFirestore).filter((v) => v !== undefined)
  }
  if (obj !== null && typeof obj === 'object') {
    const out = {}
    for (const [k, v] of Object.entries(obj)) {
      if (k === '') continue // chiave vuota → skip
      const sanitized = sanitizeForFirestore(v)
      out[k] = sanitized === undefined ? null : sanitized
    }
    return out
  }
  return obj
}

async function saveAnalysis(chapterId, analysis) {
  const safe = sanitizeForFirestore(analysis)
  const ref = db.collection('analyses').doc(chapterId)
  // Salva nella subcollection byProvider
  const providerRef = ref.collection('byProvider').doc(AI_PROVIDER)
  await providerRef.set(safe)
  await providerRef.collection('history').add(safe)
  // Aggiorna anche il doc root come cache dell'ultima analisi
  await ref.set(safe)
  // Pulisci eventuali errori precedenti per questo provider
  await db.collection('analysisErrors').doc(`${chapterId}_${AI_PROVIDER}`).delete().catch(() => {})
}

/** Salva una risposta a domanda personalizzata su Firestore */
async function saveCustomQuestion(chapterId, result) {
  await db.collection('analyses').doc(chapterId)
    .collection('questions').add(sanitizeForFirestore(result))
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
// ─── Word Frequency (no AI) ─────────────────────────────────────────────────

const ITALIAN_STOPWORDS = new Set([
  // Articoli
  'il','lo','la','i','gli','le','un','uno','una',
  // Preposizioni semplici
  'di','a','da','in','con','su','per','tra','fra',
  // Preposizioni articolate
  'del','dello','della','dei','degli','delle',
  'al','allo','alla','ai','agli','alle',
  'dal','dallo','dalla','dai','dagli','dalle',
  'nel','nello','nella','nei','negli','nelle',
  'col','coi','sul','sullo','sulla','sui','sugli','sulle',
  // Congiunzioni
  'e','ed','o','od','ma','però','eppure','quindi','dunque',
  'perché','perche','poiché','poiche','che','se','quando',
  'mentre','come','anche','allora','oppure','né','ne','anzi',
  'sebbene','benché','affinché','sicché','giacché',
  // Pronomi personali e riflessivi
  'io','tu','lui','lei','noi','voi','loro',
  'mi','ti','ci','vi','si','me','te',
  // Pronomi/avverbi relativi e dimostrativi
  'chi','cui','dove','quando','quanto','quale','quali',
  'questo','questa','questi','queste',
  'quello','quella','quelli','quelle','quel','quei','quegli',
  // Avverbi comuni
  'non','più','meno','molto','poco','troppo','già',
  'ancora','sempre','mai','solo','solamente','proprio',
  'così','cosi','bene','male','tanto','quanto',
  'quasi','subito','prima','dopo','ora','adesso','poi',
  'forse','circa','abbastanza','appena',
  // Quantificatori / indefiniti
  'ogni','tutto','tutta','tutti','tutte',
  'qualche','alcuni','alcune','nessuno','nessuna',
  'altro','altra','altri','altre',
  // Verbi ausiliari e copula
  'è','sono','sei','siamo','siete','era','erano','ero',
  'ha','hai','ho','hanno','abbiamo','avete','aveva','avevano',
  'sarà','sarai','sarò','saranno','sarebbe','siano','sia',
  'essere','avere','fare','dire',
  'fu','fui','fosse','fossero',
  // Particelle e varie
  'ecco','sì','si','no','eh','ah','oh',
])

/** Calcola frequenza delle parole significative nel testo del capitolo */
function computeWordFrequency(text) {
  const cleaned = text
    .replace(/^---[\s\S]*?---/m, '')          // YAML frontmatter
    .replace(/[#*_~`|>\[\]()]/g, ' ')        // simboli markdown
    .replace(/https?:\/\/\S+/g, ' ')         // URL
    .toLowerCase()

  const words = cleaned.split(/[\s\n\r,.;:!?"'«»()\-\u2013\u2014\d\u2018\u2019\u201C\u201D]+/).filter(Boolean)

  const freq = new Map()

  for (const word of words) {
    if (word.length < 3) continue
    if (ITALIAN_STOPWORDS.has(word)) continue
    if (/^\d+$/.test(word)) continue
    freq.set(word, (freq.get(word) ?? 0) + 1)
  }

  const totalWords = [...freq.values()].reduce((a, b) => a + b, 0)
  const uniqueWords = freq.size

  const topWords = [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 80)
    .map(([word, count]) => ({ word, count }))

  // Repetition score: percentuale di parole uniche che compaiono >= 3 volte
  const repetitiveWords = [...freq.values()].filter(c => c >= 3).length
  const repetitionScore = Math.min(100, Math.round((repetitiveWords / Math.max(1, uniqueWords)) * 200))

  return {
    topWords,
    totalWords,
    uniqueWords,
    repetitionScore,
    analyzedAt: new Date().toISOString(),
  }
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

function buildShowDontTellSection() {
  return `
  "showDontTell": {
    "score": <1-10 dove 10=ottimo showing, 1=tutto telling>,
    "summary": "<sintesi max 100 parole sul bilanciamento showing/telling del capitolo>",
    "issues": [
      {
        "quote": "<citazione esatta dal testo (max 50 parole) che mostra un caso di 'telling'>",
        "explanation": "<spiegazione breve (max 30 parole) del perché è 'telling' e non 'showing'>",
        "rewrite": "<riscrittura proposta del passaggio in chiave 'showing' (max 80 parole)>"
      }
    ]
  },`
}

function buildParagraphSection() {
  return `
  "paragraphBreaks": {
    "score": <1-10, efficacia dell'uso dei paragrafi>,
    "summary": "<sintesi max 100 parole sull'uso dei paragrafi>",
    "issues": [
      {
        "quote": "<citazione esatta dal testo (max 60 parole) che mostra il problema>",
        "type": "blocco_troppo_lungo|assenza_pausa|pausa_prematura|flusso_coscienza|altro",
        "suggestion": "<dove/come andare a capo o unire i paragrafi, max 50 parole>"
      }
    ]
  },`
}

function buildVerbTenseSection() {
  return `
  "verbTense": {
    "score": <1-10, coerenza complessiva dei tempi verbali (10=perfetta, 1=caos)>,
    "dominantTense": "<tempo principale del capitolo: passato_remoto|imperfetto|presente|passato_prossimo|futuro|misto>",
    "summary": "<sintesi max 100 parole sulla coerenza dei tempi, casi particolari gestiti bene e problemi principali>"
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
  if (prev.weaknesses?.length) parts.push(`\nDebolezze segnalate:\n${prev.weaknesses.map(w => `  - ${typeof w === 'string' ? w : w.text}`).join('\n')}`)
  if (prev.suggestions?.length) parts.push(`\nSuggerimenti dati:\n${prev.suggestions.map(s => `  - ${typeof s === 'string' ? s : s.text}`).join('\n')}`)

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

function buildPrompt(bookTitle, bookType, chapterText, previousContext, authorComment, withWeaknessSolutions = true, withSuggestionSolutions = true, withParagraphAnalysis = false, opts = {}) {
  const {
    withStrengths = true,
    withWeaknesses = true,
    withSuggestions = true,
    withCorrections = true,
    withReaderReactions = true,
    withShowDontTell = false,
    withVerbTense = false,
    withCharacters = false,
  } = opts
  const isHistorical = bookType === 'storico'
  const personas = READER_PERSONAS[isHistorical ? 'storico' : 'default']

  const historicalSection = isHistorical ? buildHistoricalSection() : ''
  const reactionsSection = withReaderReactions ? buildReaderReactionsSection(personas) : ''
  const paragraphSection = withParagraphAnalysis ? buildParagraphSection() : ''
  const showDontTellSection = withShowDontTell ? buildShowDontTellSection() : ''
  const verbTenseSection = withVerbTense ? buildVerbTenseSection() : ''

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

  const authorBlock = authorComment ? `

NOTA DELL'AUTORE (considera questo come contesto prioritario per l'analisi):
"${authorComment}"

` : ''

  const weaknessSchema = !withWeaknesses ? '' : withWeaknessSolutions
    ? `  "weaknesses": [
    {
      "text": "<descrizione del punto debole>",
      "quotes": ["<citazione esatta dal testo (max 2)>"],
      "solution": "<testo sostitutivo concreto o indicazione su come correggere il passaggio citato — max 60 parole>"
    }
  ],`
    : `  "weaknesses": [
    {
      "text": "<descrizione del punto debole>",
      "quotes": ["<citazione esatta dal testo (max 2)>"]
    }
  ],`

  const suggestionSchema = !withSuggestions ? '' : withSuggestionSolutions
    ? `  "suggestions": [
    {
      "text": "<suggerimento specifico>",
      "solution": "<esempio concreto di come applicarlo al testo (riscrittura parziale o indicazione precisa) — max 60 parole>"
    }
  ],`
    : `  "suggestions": ["<suggerimento specifico 1>", "<suggerimento specifico 2>", ...],`

  const strengthsSchema = withStrengths ? '  "strengths": ["<punto di forza 1>", "<punto di forza 2>", ...],' : ''

  const correctionsSchema = withCorrections ? `  "corrections": [
    {
      "original": "<testo originale>",
      "suggested": "<testo corretto>",
      "type": "grammar|style|clarity|continuity",
      "note": "<spiegazione breve>"
    }
  ],` : ''

  const charactersSchema = opts.withCharacters ? `  "characters": [
    {
      "name": "<nome del personaggio>",
      "role": "protagonist|antagonist|secondary|minor",
      "description": "<breve descrizione di cosa fa/come si comporta in questo capitolo (max 80 parole)>",
      "keyMoments": ["<momento chiave 1>", "<momento chiave 2>"]
    }
  ],` : ''

  const solutionInstructions = (withWeaknesses && withWeaknessSolutions || withSuggestions && withSuggestionSolutions) ? `
IMPORTANTE su ${withWeaknesses && withWeaknessSolutions && withSuggestions && withSuggestionSolutions ? 'weaknesses e suggestions' : withWeaknesses && withWeaknessSolutions ? 'weaknesses' : 'suggestions'}:
${withWeaknesses && withWeaknessSolutions ? '- Per ogni debolezza, il campo "solution" deve contenere un testo sostitutivo concreto o una riscrittura del passaggio citato (max 60 parole). Se non è possibile proporre una riscrittura, scrivi almeno un\'indicazione operativa precisa.' : ''}
${withSuggestions && withSuggestionSolutions ? '- Per ogni suggerimento, il campo "solution" deve contenere un esempio pratico su come applicarlo: una riscrittura di una frase/paragrafo del capitolo oppure un\'indicazione concreta (max 60 parole).' : ''}
- Il campo "solution" NON deve essere una ripetizione del testo del punto debole/suggerimento, ma una proposta operativa.` : ''

  // Istruzione sulle sezioni escluse (per non inventare campi non richiesti)
  const excludedSections = [
    !withStrengths && 'strengths',
    !withWeaknesses && 'weaknesses',
    !withSuggestions && 'suggestions',
    !withCorrections && 'corrections',
    !withReaderReactions && 'readerReactions',
    !withShowDontTell && 'showDontTell',
    !withVerbTense && 'verbTense',
    !opts.withCharacters && 'characters',
  ].filter(Boolean)
  const excludedNote = excludedSections.length > 0
    ? `\nNOTA: le sezioni ${excludedSections.map(s => `"${s}"`).join(', ')} NON devono essere presenti nel JSON — sono state disabilitate dall'autore.`
    : ''

  return `
Sei un editor letterario italiano di alto livello. Analizza il seguente capitolo del libro
intitolato "${bookTitle}" (genere: ${bookType || 'generico'}) e fornisci un'analisi dettagliata e professionale.
${previousBlock}${authorBlock}

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
  },${reactionsSection}
  "summary": "<sintesi dell'analisi, max 200 parole>",
${strengthsSchema}
${weaknessSchema}
${suggestionSchema}
${charactersSchema}
${correctionsSchema}${historicalSection}${paragraphSection}${showDontTellSection}${verbTenseSection}
  "_placeholder": null
}
${excludedNote}
${opts.withCharacters ? `IMPORTANTE sui personaggi:
- Elenca TUTTI i personaggi che appaiono nel capitolo, anche quelli con ruoli brevi.
- "role" deve essere: protagonist, antagonist, secondary, o minor.
- "description" descrive cosa fa il personaggio IN QUESTO CAPITOLO (non la sua storia generale).
- Se non ci sono personaggi nel capitolo, restituisci "characters": [].` : ''}
${withCorrections ? `IMPORTANTE sulle correzioni:
- Sii ESAUSTIVO: elenca le correzioni che trovi (grammatica, stile, chiarezza, continuità), con limite di 20.
- Non fermarti alle prime 5-10: analizza ogni paragrafo del capitolo e segnala ogni problema.
- Per ogni correzione, "original" deve essere il testo ESATTO presente nel capitolo (copia-incolla) per permettere la sostituzione automatica.` : ''}
${solutionInstructions}

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
${withParagraphAnalysis ? `
Criteri analisi paragrafi (paragraphBreaks) — leggi ATTENTAMENTE ogni blocco di testo:
- Segnala blocchi eccessivamente lunghi che andrebbero divisi (oltre 5-7 frasi dense senza pausa visiva)
- Segnala pause a capo in punti inappropriati (spezza il ritmo, separa causa ed effetto strettamente legati)
- Valuta se l'alternanza tra blocchi brevi e lunghi supporta il ritmo narrativo
- Segnala sezioni di flusso di coscienza/stream non marcate che disorientano il lettore
- Non segnalare come problema stili intenzionali coerenti (es. paragrafi brevissimi per tensione)
` : ''}
${withShowDontTell ? `
Criteri Show Don't Tell (showDontTell) — PRINCIPIO FONDAMENTALE della narrativa:
- "Telling": l'autore DESCRIVE DIRETTAMENTE emozioni, carattere, situazioni (es: "Era triste", "Era un uomo crudele", "Si sentiva in imbarazzo")
- "Showing": l'autore li MOSTRA attraverso azioni, dialoghi, dettagli sensoriali, reazioni fisiche (es: "Le lacrime le rigarono le guance senza che se ne accorgesse")
- CERCA ATTIVAMENTE frasi come: "Era [aggettivo emozione]", "Si sentiva [stato d'animo]", "Era una persona [carattere]", narrazioni dirette di stati interiori senza ancorarli in azioni/dettagli concreti
- Per ogni caso trovato proponi una riscrittura CONCRETA: usa dettagli fisici, comportamenti osservabili, dialoghi rivelatori
- Il voto 10 indica un eccellente uso dello showing; voto 1 indica un testo quasi interamente basato sul telling
- Segnala SOLO i casi più significativi e correggibili (max 8-10 issues)
` : ''}${withVerbTense ? `
Criteri controllo tempi verbali (verbTense) — COERENZA NARRATIVA:
- Identifica il TEMPO DOMINANTE del capitolo (es. passato remoto, imperfetto, presente)
- Segnala SOLO i cambi di tempo INCOERENTI e non intenzionali — non quelli stilisticamente giustificati
- CASI LECITI da NON segnalare come errori:
  · Imperfetto all'interno di una narrazione al passato remoto (azioni abituali/stati di sfondo: "ogni giorno andava", "la stanza era buia")
  · Flashback con cambio di piano narrativo esplicito (può usare tempi diversi)
  · Dialoghi diretti (possono usare qualsiasi tempo)
  · Discorso indiretto libero (il pensiero del personaggio può rispecchiare il suo "presente")
  · Frasi proverbiali o massime universali (tipicamente al presente)
  · Cambio intenzionale per enfasi stilistica o effetto cinematografico
- SEGNALA COME verb_tense nelle corrections:
  · Uso del presente indicativo al posto del passato remoto/imperfetto in contesti narrativi puri (non dialogo, non flashback)
  · Miscelazione caotica di passato prossimo e passato remoto nella stessa scena descrittiva
  · Futuro o condizionale usato dove non è né il pensiero del personaggio né un'azione futura logica
  · Congiuntivi al posto di indicativi in contesti chiari (o viceversa se crea ambiguità)
- Per ogni correzione verb_tense: "original" = testo ESATTO dal capitolo, "suggested" = testo corretto, "note" = spiegazione breve del perché è sbagliato
- Max 15 correzioni verb_tense; segnala PRIMA gli errori più gravi
- Popola "verbTense.dominantTense" con una delle opzioni: passato_remoto | imperfetto | presente | passato_prossimo | futuro | misto
` : ''}
--- CAPITOLO ---
${chapterText}
`.trim()
}

// ─── AI Provider Calls ───────────────────────────────────────────────────────

async function callClaude(prompt, previousContext) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY non configurata')
  const client = new Anthropic({
    apiKey,
    timeout: API_TIMEOUT_MS.claude,
  })
  const message = await client.messages.create({
    model: PROVIDER_MODELS.claude,
    max_tokens: previousContext ? 12000 : 8000,
    messages: [{role: 'user', content: prompt}],
  })
  const block = message.content[0]
  return block?.type === 'text' ? block.text : ''
}

async function callGemini(prompt, previousContext, retryCount = 0) {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('GEMINI_API_KEY non configurata')
  const model = PROVIDER_MODELS.gemini
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`
  const timeoutMs = API_TIMEOUT_MS.gemini

  let res
  try {
    res = await fetchWithTimeout(url, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        contents: [{parts: [{text: prompt}]}],
        generationConfig: {
          maxOutputTokens: previousContext ? 12000 : 10000,
          temperature: 0.7,
          responseMimeType: 'application/json',
        },
      }),
    }, timeoutMs)
  } catch (err) {
    if (err.name === 'AbortError') {
      if (retryCount === 0) {
        console.warn(`  Gemini timeout (${timeoutMs / 1000}s), retry con gemini-2.0-flash…`)
        const origModel = PROVIDER_MODELS.gemini
        PROVIDER_MODELS.gemini = 'gemini-2.0-flash'
        try {
          return await callGemini(prompt, previousContext, 1)
        } finally {
          PROVIDER_MODELS.gemini = origModel
        }
      }
      throw new Error(`Gemini timeout dopo ${timeoutMs / 1000}s (anche su retry con gemini-2.0-flash)`)
    }
    throw err
  }

  // Retry automatico su 503 (server sovraccarico) e 429 (rate limit)
  if ((res.status === 503 || res.status === 429) && retryCount < 3) {
    const waitSec = [30, 60, 120][retryCount] // 30s → 1min → 2min
    console.warn(`  Gemini ${res.status} (${res.status === 503 ? 'server sovraccarico' : 'rate limit'}), retry ${retryCount + 1}/3 tra ${waitSec}s…`)
    await new Promise((r) => setTimeout(r, waitSec * 1000))
    return callGemini(prompt, previousContext, retryCount + 1)
  }

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
  const client = new OpenAI({
    apiKey,
    timeout: API_TIMEOUT_MS.chatgpt,
  })
  const response = await client.chat.completions.create({
    model: PROVIDER_MODELS.chatgpt,
    max_tokens: previousContext ? 12000 : 8000,
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

  const prompt = buildPrompt(bookTitle, bookType, chapterText, previousContext || null, AUTHOR_COMMENT, WITH_WEAKNESS_SOLUTIONS, WITH_SUGGESTION_SOLUTIONS, WITH_PARAGRAPH_ANALYSIS, {
    withStrengths: WITH_STRENGTHS,
    withWeaknesses: WITH_WEAKNESSES,
    withSuggestions: WITH_SUGGESTIONS,
    withCorrections: WITH_CORRECTIONS,
    withReaderReactions: WITH_READER_REACTIONS,
    withShowDontTell: WITH_SHOW_DONT_TELL,
    withVerbTense: WITH_VERB_TENSE,
    withCharacters: WITH_CHARACTERS,
  })
  if (AUTHOR_COMMENT) {
    console.log(`  Nota autore inclusa nel prompt (${AUTHOR_COMMENT.length} chars)`)
  }
  console.log(`  Sezioni: forza=${WITH_STRENGTHS?'✓':'✗'} debol=${WITH_WEAKNESSES?'✓':'✗'} sugg=${WITH_SUGGESTIONS?'✓':'✗'} corr=${WITH_CORRECTIONS?'✓':'✗'} reaz=${WITH_READER_REACTIONS?'✓':'✗'} showDontTell=${WITH_SHOW_DONT_TELL?'✓':'✗'} verbTense=${WITH_VERB_TENSE?'✓':'✗'}`)
  console.log(`  Soluzioni: debolezze=${WITH_WEAKNESS_SOLUTIONS ? '✓' : '✗'} | suggerimenti=${WITH_SUGGESTION_SOLUTIONS ? '✓' : '✗'} | paragrafi=${WITH_PARAGRAPH_ANALYSIS ? '✓' : '✗'}`)

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
    // Estrai il blocco JSON dalla risposta (prende tutto da { in poi)
    const jsonMatch = responseText.match(/\{[\s\S]*/)
    if (!jsonMatch) throw new Error('Nessun JSON nella risposta')

    let jsonStr = jsonMatch[0]

    // ── Pre-sanitizzazione: caratteri Unicode problematici ──────────────────
    jsonStr = jsonStr
      .replace(/[\u2018\u2019]/g, "'")    // ' '  → apostrofo normale
      .replace(/[\u201C\u201D]/g, '"')    // " "  → virgolette normali
      .replace(/[\u2013\u2014]/g, '-')    // – —  → trattino
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // caratteri di controllo

    let parsed
    try {
      // Tentativo 1: JSON.parse standard
      parsed = JSON.parse(jsonStr)
    } catch (firstErr) {
      // Log contesto dell'errore per debug
      const posMatch = firstErr.message.match(/position (\d+)/)
      if (posMatch) {
        const pos = parseInt(posMatch[1])
        const ctx = jsonStr.slice(Math.max(0, pos - 80), pos + 80)
        console.warn(`  Contesto errore (pos ${pos}): …${ctx}…`)
      }

      try {
        // Tentativo 2: jsonrepair — gestisce apostrofi non escapati,
        // backslash invalidi, virgole finali, JSON troncato, ecc.
        console.warn(`  JSON malformato (${firstErr.message}), provo jsonrepair…`)
        const repaired = jsonrepair(jsonStr)
        parsed = JSON.parse(repaired)
        console.warn(`  ✓ JSON riparato con jsonrepair`)
      } catch (repairErr) {
        // Tentativo 3: tronca al punto valido + jsonrepair
        console.warn(`  jsonrepair fallito (${repairErr.message}), provo troncatura…`)
        let validEnd = -1
        let depth = 0
        let inString = false
        let escape = false
        for (let i = 0; i < jsonStr.length; i++) {
          const ch = jsonStr[i]
          if (escape) { escape = false; continue }
          if (ch === '\\') { escape = true; continue }
          if (ch === '"') { inString = !inString; continue }
          if (inString) continue
          if (ch === '{' || ch === '[') depth++
          else if (ch === '}' || ch === ']') {
            depth--
            if (depth === 0) { validEnd = i; break }
          }
        }
        if (validEnd > 0) {
          const truncated = jsonStr.slice(0, validEnd + 1)
          const repaired2 = jsonrepair(truncated)
          parsed = JSON.parse(repaired2)
          console.warn(`  ✓ JSON recuperato troncando a posizione ${validEnd}`)
        } else {
          throw repairErr
        }
      }
    }

    // Rimuovi il placeholder
    delete parsed._placeholder
    const result = {
      chapterId: chapter.id,
      provider: AI_PROVIDER,
      analyzedAt: new Date().toISOString(),
      model: modelName,
      ...parsed,
    }
    // Salva il commento autore se presente
    if (AUTHOR_COMMENT) result.authorComment = AUTHOR_COMMENT
    // Calcola frequenza parole (senza AI) se richiesto
    if (WITH_WORD_FREQUENCY) {
      result.wordFrequency = computeWordFrequency(chapterText)
      console.log(`  Frequenza parole: ${result.wordFrequency.totalWords} parole, ${result.wordFrequency.uniqueWords} uniche, score ripetitività=${result.wordFrequency.repetitionScore}`)
    }
    return result
  } catch (err) {
    const msg = `Errore parsing JSON per ${chapter.id}: ${err.message}. Response (500 chars): ${responseText.substring(0, 500)}`
    console.error(`  ${msg}`)
    await saveAnalysisError(chapter.id, msg)
    return null
  }
}

// ─── Custom Question Mode ────────────────────────────────────────────────────

function buildCustomQuestionPrompt(bookTitle, bookType, question, chapterText) {
  return `
Sei un editor letterario italiano di alto livello. Hai ricevuto una domanda precisa dall'autore sul suo capitolo.

Libro: "${bookTitle}" (genere: ${bookType || 'generico'})

DOMANDA DELL'AUTORE:
"${question}"

Rispondi ESCLUSIVAMENTE con un oggetto JSON valido (nessun testo prima o dopo), con questa struttura:
{
  "answer": "<risposta dettagliata alla domanda, max 300 parole — sii specifico e operativo>",
  "findings": [
    {
      "quote": "<citazione esatta dal testo (max 40 parole) a cui si riferisce l'osservazione — ometti se non pertinente>",
      "observation": "<osservazione specifica e concreta in risposta alla domanda (max 80 parole)>",
      "suggestion": "<suggerimento operativo: riscrittura, indicazione precisa, max 60 parole — ometti se non pertinente>"
    }
  ],
  "corrections": [
    {
      "original": "<testo originale esatto>",
      "suggested": "<testo corretto>",
      "type": "grammar|style|clarity|continuity",
      "note": "<spiegazione breve>"
    }
  ],
  "_placeholder": null
}

ISTRUZIONI:
- "answer" deve rispondere direttamente alla domanda dell'autore con osservazioni concrete
- "findings" devono essere esempi specifici dal testo che supportano la risposta (max 8 elementi)
- "corrections" sono opzionali: includile solo se la domanda riguarda errori o stile, max 10 correzioni
- Se la domanda non riguarda correzioni grammaticali, lascia "corrections" come array vuoto
- Cita SEMPRE parti specifiche del testo per ancorare le osservazioni

--- CAPITOLO ---
${chapterText}
`.trim()
}

async function analyzeChapterCustomQuestion(chapter, bookSettings) {
  const bookTitle = bookSettings?.title || chapter.title
  const bookType = bookSettings?.bookType || 'generico'

  let chapterText = ''
  if (chapter.driveContent && chapter.driveContent.trim().length > 50) {
    chapterText = chapter.driveContent
  } else {
    const mdPath = join(REPO_DIR, 'chapters-content', `${chapter.id}.md`)
    try {
      chapterText = await readFile(mdPath, 'utf-8')
    } catch {
      chapterText = chapter.synopsis || ''
    }
  }

  if (!chapterText.trim()) {
    console.warn(`  Nessun testo trovato per ${chapter.id}, skip.`)
    return null
  }

  console.log(`  Domanda: "${CUSTOM_QUESTION.substring(0, 80)}${CUSTOM_QUESTION.length > 80 ? '…' : ''}"`)

  const prompt = buildCustomQuestionPrompt(bookTitle, bookType, CUSTOM_QUESTION, chapterText)
  const modelName = PROVIDER_MODELS[AI_PROVIDER] ?? PROVIDER_MODELS.claude
  let responseText = ''

  try {
    if (AI_PROVIDER === 'gemini') {
      responseText = await callGemini(prompt, false)
    } else if (AI_PROVIDER === 'chatgpt') {
      responseText = await callChatGPT(prompt, false)
    } else {
      responseText = await callClaude(prompt, false)
    }
  } catch (apiErr) {
    const msg = `Errore chiamata ${AI_PROVIDER} (domanda): ${apiErr.message ?? apiErr}`
    console.error(`  ${msg}`)
    await saveAnalysisError(chapter.id, msg)
    return null
  }

  if (!responseText) {
    const msg = `Risposta vuota da ${AI_PROVIDER} (domanda)`
    console.warn(`  ${msg}`)
    await saveAnalysisError(chapter.id, msg)
    return null
  }

  try {
    const jsonMatch = responseText.match(/\{[\s\S]*/)
    if (!jsonMatch) throw new Error('Nessun JSON nella risposta')

    let jsonStr = jsonMatch[0]
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[\u201C\u201D]/g, '"')
      .replace(/[\u2013\u2014]/g, '-')
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')

    let parsed
    try {
      parsed = JSON.parse(jsonStr)
    } catch {
      const {jsonrepair: repair} = await import('jsonrepair')
      parsed = JSON.parse(repair(jsonStr))
    }

    delete parsed._placeholder
    return {
      chapterId: chapter.id,
      question: CUSTOM_QUESTION,
      provider: AI_PROVIDER,
      model: modelName,
      analyzedAt: new Date().toISOString(),
      answer: parsed.answer ?? '',
      findings: parsed.findings ?? [],
      corrections: parsed.corrections ?? [],
    }
  } catch (err) {
    const msg = `Errore parsing JSON (domanda) per ${chapter.id}: ${err.message}`
    console.error(`  ${msg}`)
    await saveAnalysisError(chapter.id, msg)
    return null
  }
}

async function main() {
  const [chapters, bookSettings] = await Promise.all([getChapters(), getSettings()])

  // Sovrascrivi i modelli con quelli selezionati dall'utente nelle impostazioni
  if (bookSettings?.claudeModel) PROVIDER_MODELS.claude = bookSettings.claudeModel
  if (bookSettings?.geminiModel) PROVIDER_MODELS.gemini = bookSettings.geminiModel

  console.log(`Impostazioni libro: tipo=${bookSettings?.bookType ?? 'generico'}, titolo=${bookSettings?.title ?? '?'}`)
  console.log(`Provider AI: ${AI_PROVIDER} (modello: ${PROVIDER_MODELS[AI_PROVIDER] ?? '?'})`)

  const toAnalyze =
    CHAPTER_ID === 'all'
      ? chapters
      : chapters.filter((c) => c.id === CHAPTER_ID)

  if (toAnalyze.length === 0) {
    console.log('Nessun capitolo trovato da analizzare.')
    return
  }

  // ── Modalità domanda personalizzata ────────────────────────────────────────
  if (CUSTOM_QUESTION) {
    console.log(`Modalità: DOMANDA PERSONALIZZATA`)
    console.log(`Domanda: "${CUSTOM_QUESTION}"`)
    for (const chapter of toAnalyze) {
      console.log(`Capitolo [${AI_PROVIDER}]: ${chapter.number} - ${chapter.title}`)
      const result = await analyzeChapterCustomQuestion(chapter, bookSettings)
      if (!result) continue
      await saveCustomQuestion(chapter.id, result)
      console.log(`  ✓ Risposta salvata su Firestore (analyses/${chapter.id}/questions)`)
    }
    console.log('Analisi domanda completata.')
    return
  }

  // ── Modalità analisi standard ────────────────────────────────────────────
  console.log(`Modalità: ${INCLUDE_PREVIOUS ? 'con contesto analisi precedente' : 'analisi da zero'}`)
  console.log(`Soluzioni proposte: debolezze=${WITH_WEAKNESS_SOLUTIONS ? '✓' : '✗'} | suggerimenti=${WITH_SUGGESTION_SOLUTIONS ? '✓' : '✗'}`)
  console.log(`Analisi paragrafi: ${WITH_PARAGRAPH_ANALYSIS ? '✓ attiva' : '✗ disabilitata'}`)
  console.log(`Frequenza parole: ${WITH_WORD_FREQUENCY ? '✓ attiva' : '✗ disabilitata'}`)
  console.log(`Show Don't Tell: ${WITH_SHOW_DONT_TELL ? '✓ attiva' : '✗ disabilitata'}`)
  console.log(`Sezioni: forza=${WITH_STRENGTHS?'✓':'✗'} debol=${WITH_WEAKNESSES?'✓':'✗'} sugg=${WITH_SUGGESTIONS?'✓':'✗'} corr=${WITH_CORRECTIONS?'✓':'✗'} reaz=${WITH_READER_REACTIONS?'✓':'✗'} showDontTell=${WITH_SHOW_DONT_TELL?'✓':'✗'}`)

  for (const chapter of toAnalyze) {
    const analysis = await analyzeChapter(chapter, bookSettings)
    if (!analysis) continue
    await saveAnalysis(chapter.id, analysis)
    console.log(`  ✓ Analisi salvata su Firestore (analyses/${chapter.id})`)
    // Estrai e upsert personaggi se richiesto
    if (WITH_CHARACTERS && analysis.characters?.length > 0) {
      console.log(`  → Estrazione personaggi: ${analysis.characters.length} trovati`)
      await upsertCharacters(chapter.id, chapter.title, analysis.characters)
    }
  }

  console.log('Analisi completata.')
}

main().catch((err) => {
  console.error('Errore fatale:', err)
  process.exit(1)
})
