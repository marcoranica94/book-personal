// ─── Enums (const objects — compatibili con erasableSyntaxOnly) ───────────────

export const ChapterStatus = {
  TODO: 'TODO',
  IN_PROGRESS: 'IN_PROGRESS',
  REVIEW: 'REVIEW',
  EXTERNAL_REVIEW: 'EXTERNAL_REVIEW',
  REFINEMENT: 'REFINEMENT',
  DONE: 'DONE',
} as const
export type ChapterStatus = (typeof ChapterStatus)[keyof typeof ChapterStatus]

export const Priority = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  URGENT: 'URGENT',
} as const
export type Priority = (typeof Priority)[keyof typeof Priority]

export const CorrectionType = {
  GRAMMAR: 'grammar',
  STYLE: 'style',
  CLARITY: 'clarity',
  CONTINUITY: 'continuity',
  VERB_TENSE: 'verb_tense',
} as const
export type CorrectionType = (typeof CorrectionType)[keyof typeof CorrectionType]

export const BookType = {
  GENERICO: 'generico',
  STORICO: 'storico',
  FANTASY: 'fantasy',
  THRILLER: 'thriller',
  ROMANZO: 'romanzo',
  GIALLO: 'giallo',
  SAGGIO: 'saggio',
  AUTOBIOGRAFIA: 'autobiografia',
} as const
export type BookType = (typeof BookType)[keyof typeof BookType]

export const AIProvider = {
  CLAUDE: 'claude',
  GEMINI: 'gemini',
  CHATGPT: 'chatgpt',
} as const
export type AIProvider = (typeof AIProvider)[keyof typeof AIProvider]

export const AI_PROVIDER_CONFIG: Record<AIProvider, { label: string; color: string; dot: string; icon: string }> = {
  claude: { label: 'Claude', color: 'text-orange-400', dot: 'bg-orange-400', icon: '🟠' },
  gemini: { label: 'Gemini', color: 'text-blue-400', dot: 'bg-blue-400', icon: '🔵' },
  chatgpt: { label: 'ChatGPT', color: 'text-green-400', dot: 'bg-green-400', icon: '🟢' },
}

// ─── Core Domain Types ────────────────────────────────────────────────────────

export interface ChecklistItem {
  id: string
  text: string
  done: boolean
}

export interface Chapter {
  id: string
  number: number
  title: string
  subtitle: string
  status: ChapterStatus
  priority: Priority
  tags: string[]
  targetChars: number
  currentChars: number
  wordCount: number
  synopsis: string
  notes: string
  checklist: ChecklistItem[]
  filePath: string
  createdAt: string
  updatedAt: string
  dueDate: string | null
  assignedReviewer: string | null
  // Drive sync (opzionali — assenti sui capitoli pre-Drive)
  driveFileId?: string | null
  driveFileName?: string | null
  driveMimeType?: string | null
  driveWebViewLink?: string | null
  contentHash?: string | null
  driveModifiedTime?: string | null
  lastSyncAt?: string | null
  syncSource?: SyncSource
  syncStatus?: SyncStatus
  syncError?: string | null
  driveContent?: string | null
}

export interface AnalysisScores {
  stile: number
  chiarezza: number
  ritmo: number
  sviluppoPersonaggi: number
  trama: number
  originalita: number
  overall: number
}

export interface AnalysisCorrection {
  original: string
  suggested: string
  type: CorrectionType
  note: string
}

/** Debolezza strutturata con citazioni dal testo (retrocompatibile con semplice stringa) */
export interface WeaknessItem {
  text: string
  quotes: string[]
  /** Possibile soluzione proposta dall'IA (testo sostitutivo o indicazione concreta) */
  solution?: string
}

/** Suggerimento strutturato con possibile soluzione proposta dall'IA */
export interface SuggestionItem {
  text: string
  /** Esempio di testo sostitutivo o indicazione concreta su come applicarlo */
  solution?: string
}

export interface HistoricalAccuracyIssue {
  quote: string
  issue: string
  suggestion: string
}

export interface HistoricalAccuracyAnalysis {
  score: number
  summary: string
  anachronisms: string[]
  correct: string[]
  issues: HistoricalAccuracyIssue[]
}

export interface ReaderReaction {
  persona: string
  emoji: string
  rating: number  // 1-5
  reaction: string
  questions: string[]
  comment: string
}

export interface ParagraphBreakIssue {
  /** Citazione dal testo che mostra il problema */
  quote: string
  /** Tipo di problema: blocco_troppo_lungo | assenza_pausa | pausa_prematura | flusso_coscienza */
  type: 'blocco_troppo_lungo' | 'assenza_pausa' | 'pausa_prematura' | 'flusso_coscienza' | 'altro'
  /** Suggerimento su dove/come andare a capo */
  suggestion: string
}

export interface ParagraphBreaksAnalysis {
  /** Voto 1-10 sull'uso dei paragrafi */
  score: number
  /** Sintesi breve (max 100 parole) */
  summary: string
  /** Problemi specifici trovati */
  issues: ParagraphBreakIssue[]
}

// ─── Verb Tense Analysis ──────────────────────────────────────────────────────

export interface VerbTenseAnalysis {
  /** Voto 1-10 (10 = coerenza perfetta, 1 = caos di tempi) */
  score: number
  /** Tempo verbale dominante del capitolo (es. "passato_remoto", "presente", "imperfetto") */
  dominantTense: string
  /** Sintesi breve (max 100 parole) */
  summary: string
}

// ─── Show Don't Tell Analysis ─────────────────────────────────────────────────

export interface ShowDontTellIssue {
  /** Citazione esatta dal testo ("telling") */
  quote: string
  /** Spiegazione breve del perché è "telling" */
  explanation: string
  /** Riscrittura proposta in chiave "showing" */
  rewrite: string
}

export interface ShowDontTellAnalysis {
  /** Voto 1-10 (10 = eccellente showing, 1 = tutto telling) */
  score: number
  /** Sintesi breve (max 100 parole) */
  summary: string
  /** Casi problematici trovati con riscrittura proposta */
  issues: ShowDontTellIssue[]
}

// ─── Word Frequency Analysis ─────────────────────────────────────────────────

export interface WordFrequencyEntry {
  word: string
  count: number
}

export interface WordFrequencyAnalysis {
  /** Top N parole più usate (filtrate stopwords) */
  topWords: WordFrequencyEntry[]
  /** Totale parole significative nel capitolo */
  totalWords: number
  /** Parole uniche significative */
  uniqueWords: number
  /** Punteggio ripetitività 0-100 (più alto = più ripetitivo) */
  repetitionScore: number
  analyzedAt: string
}

// ─── Custom Question Analysis ────────────────────────────────────────────────

export interface CustomQuestionFinding {
  /** Citazione esatta dal testo (opzionale) */
  quote?: string
  /** Osservazione specifica in risposta alla domanda */
  observation: string
  /** Suggerimento operativo (opzionale) */
  suggestion?: string
}

/** Analisi mirata a una domanda precisa dell'autore.
 *  Firestore: /analyses/{chapterId}/questions/{autoId} */
export interface CustomQuestion {
  /** Set on read from Firestore */
  id?: string
  chapterId: string
  question: string
  provider: AIProvider
  model: string
  analyzedAt: string
  /** Risposta principale alla domanda (max 300 parole) */
  answer: string
  /** Osservazioni specifiche con citazioni dal testo */
  findings: CustomQuestionFinding[]
  /** Correzioni puntali (stessa struttura dell'analisi standard) */
  corrections: AnalysisCorrection[]
}

/** Risultato della riformattazione paragrafi (Firestore: /paragraphReformats/{chapterId}) */
export interface ParagraphReformat {
  chapterId: string
  provider: AIProvider
  model: string
  reformattedAt: string
  reformattedText: string
  /** Breve descrizione dei cambiamenti effettuati */
  changesSummary: string
  /** Numero di paragrafi aggiunti/modificati */
  paragraphsChanged: number
}

export interface ChapterAnalysis {
  chapterId: string
  provider: AIProvider
  analyzedAt: string
  model: string
  scores: AnalysisScores
  summary: string
  strengths: string[]
  weaknesses: (string | WeaknessItem)[]
  suggestions: (string | SuggestionItem)[]
  corrections: AnalysisCorrection[]
  // Accept/reject tracking
  acceptedCorrections?: number[]
  rejectedCorrections?: number[]
  appliedAt?: string | null
  // Nota dell'autore inviata prima dell'analisi
  authorComment?: string
  // Genere-specific sections
  historicalAccuracy?: HistoricalAccuracyAnalysis
  readerReactions?: ReaderReaction[]
  paragraphBreaks?: ParagraphBreaksAnalysis
  wordFrequency?: WordFrequencyAnalysis
  showDontTell?: ShowDontTellAnalysis
  verbTense?: VerbTenseAnalysis
  // Characters extracted from this chapter during analysis
  characters?: CharacterChapterAppearance[]
}

// ─── Character Types ──────────────────────────────────────────────────────────

export const CharacterRole = {
  PROTAGONIST: 'protagonist',
  ANTAGONIST: 'antagonist',
  SECONDARY: 'secondary',
  MINOR: 'minor',
} as const
export type CharacterRole = (typeof CharacterRole)[keyof typeof CharacterRole]

export const CHARACTER_ROLE_CONFIG: Record<CharacterRole, {label: string; color: string; bg: string; border: string}> = {
  protagonist: {label: 'Protagonista', color: 'text-violet-100', bg: 'bg-violet-800/50', border: 'border-violet-500/40'},
  antagonist:  {label: 'Antagonista',  color: 'text-rose-100',   bg: 'bg-rose-800/50',   border: 'border-rose-500/40'},
  secondary:   {label: 'Secondario',   color: 'text-amber-100',  bg: 'bg-amber-800/45',  border: 'border-amber-500/40'},
  minor:       {label: 'Minore',       color: 'text-slate-200',  bg: 'bg-slate-700/50',  border: 'border-slate-500/40'},
}

export interface CharacterChapterAppearance {
  chapterId: string
  chapterTitle: string
  role: CharacterRole
  description: string
  keyMoments?: string[]
}

export interface Character {
  id: string
  name: string
  aliases: string[]
  role: CharacterRole
  age?: string
  physicalDescription: string
  personalityTraits: string[]
  backstory: string
  motivation: string
  chaptersAppearing: CharacterChapterAppearance[]
  notes: string
  createdAt: string
  updatedAt: string
  extractedFromAnalysis?: boolean
  lastAnalyzedAt?: string
}

export interface CharacterAnalysisScores {
  consistency: number
  depth: number
  development: number
  motivation: number
  uniqueness: number
  overall: number
}

export interface CharacterConsistencyIssue {
  chapterId?: string
  chapterTitle?: string
  issue: string
}

export interface CharacterChapterBreakdown {
  chapterId: string
  chapterTitle: string
  role: string
  summary: string
}

export interface CharacterAnalysis {
  characterId: string
  characterName: string
  provider: AIProvider
  analyzedAt: string
  model: string
  scores: CharacterAnalysisScores
  overview: string
  arc: string
  strengths: string[]
  weaknesses: string[]
  consistencyIssues: CharacterConsistencyIssue[]
  suggestions: string[]
  chaptersBreakdown: CharacterChapterBreakdown[]
}

export const CHARACTER_SCORE_LABELS: Record<keyof CharacterAnalysisScores, string> = {
  consistency: 'Coerenza',
  depth: 'Profondità',
  development: 'Sviluppo',
  motivation: 'Motivazioni',
  uniqueness: 'Originalità',
  overall: 'Complessivo',
}

export interface BookSettings {
  title: string
  subtitle: string
  author: string
  genre: string
  bookType: BookType
  defaultAIProvider: AIProvider
  /** Modello Claude selezionato dall'utente */
  claudeModel?: string
  /** Modello Gemini selezionato dall'utente */
  geminiModel?: string
  targetWords: number
  targetChapters: number
  startDate: string
  targetEndDate: string | null
  language: string
  synopsis: string
  charsPerPage: number
  wordsPerPage: number
  wordsPerMinuteReading: number
  githubPat?: string
}

// ─── AI Model Catalogs ────────────────────────────────────────────────────────

export interface AIModelOption {
  id: string
  label: string
  description: string
  default?: boolean
}

export const CLAUDE_MODELS: AIModelOption[] = [
  {id: 'claude-sonnet-4-6',       label: 'Claude Sonnet 4.6',       description: 'Bilanciato — qualità e velocità', default: true},
  {id: 'claude-opus-4-5',         label: 'Claude Opus 4.5',         description: 'Il più potente, lento e costoso'},
  {id: 'claude-haiku-3-5',        label: 'Claude Haiku 3.5',        description: 'Veloce ed economico'},
  {id: 'claude-sonnet-3-7',       label: 'Claude Sonnet 3.7',       description: 'Generazione precedente'},
]

export const GEMINI_MODELS: AIModelOption[] = [
  {id: 'gemini-3.1-flash-lite-preview', label: 'Gemini 3.1 Flash Lite (preview)', description: 'Veloce e gratuito', default: true},
  {id: 'gemini-2.5-flash',              label: 'Gemini 2.5 Flash',                description: 'Bilanciato'},
  {id: 'gemini-2.5-pro',                label: 'Gemini 2.5 Pro',                  description: 'Il più capace di Gemini'},
  {id: 'gemini-2.0-flash',              label: 'Gemini 2.0 Flash',                description: 'Veloce, generazione precedente'},
]

export interface StatsSnapshot {
  date: string
  totalChars: number
  totalWords: number
  totalPages: number
  chaptersByStatus: Record<ChapterStatus, number>
}

// ─── Drive Sync Types ─────────────────────────────────────────────────────────

export const SyncStatus = {
  SYNCED: 'synced',
  PENDING_PUSH: 'pending_push',
  PENDING_PULL: 'pending_pull',
  CONFLICT: 'conflict',
  ERROR: 'error',
  NOT_LINKED: 'not_linked',
} as const
export type SyncStatus = (typeof SyncStatus)[keyof typeof SyncStatus]

export const SyncSource = {
  DRIVE: 'drive',
  DASHBOARD: 'dashboard',
  AI: 'ai',
  MANUAL: 'manual',
} as const
export type SyncSource = (typeof SyncSource)[keyof typeof SyncSource]

// ─── Google Drive Types ───────────────────────────────────────────────────────

export interface DriveTokens {
  accessToken: string
  refreshToken: string // AES-256-GCM encrypted
  expiresAt: number   // timestamp ms
}

export interface DriveConfig {
  uid: string
  folderId: string
  folderName: string
  tokens: DriveTokens
  createdAt: string
  updatedAt: string
}

export interface DriveFile {
  id: string
  name: string
  mimeType: string
  modifiedTime: string
  md5Checksum?: string
  size?: string
  webViewLink?: string
}

// ─── UI / App Types ───────────────────────────────────────────────────────────

export interface GitHubUser {
  login: string
  name: string | null
  avatar_url: string
  html_url: string
}

export interface AuthState {
  token: string | null
  user: GitHubUser | null
  isAuthenticated: boolean
  isLoading: boolean
}

export type ViewMode = 'kanban' | 'list'

export type Theme = 'dark' | 'light'

export interface KanbanFilters {
  search: string
  priority: Priority | null
  tags: string[]
}

// ─── GitHub API Types ─────────────────────────────────────────────────────────

export interface GitHubFileContent {
  content: string
  sha: string
  encoding: string
}

export interface DeviceCodeResponse {
  device_code: string
  user_code: string
  verification_uri: string
  expires_in: number
  interval: number
}

export interface AccessTokenResponse {
  access_token: string
  token_type: string
  scope: string
  error?: string
  error_description?: string
}

// ─── Constants Helpers ────────────────────────────────────────────────────────

export const STATUS_CONFIG: Record<
  ChapterStatus,
  { label: string; color: string; bg: string; border: string }
> = {
  [ChapterStatus.TODO]: {
    label: 'Da fare',
    color: 'text-slate-300',
    bg: 'bg-slate-800',
    border: 'border-slate-600',
  },
  [ChapterStatus.IN_PROGRESS]: {
    label: 'In scrittura',
    color: 'text-blue-300',
    bg: 'bg-blue-950',
    border: 'border-blue-700',
  },
  [ChapterStatus.REVIEW]: {
    label: 'In revisione',
    color: 'text-amber-300',
    bg: 'bg-amber-950',
    border: 'border-amber-700',
  },
  [ChapterStatus.EXTERNAL_REVIEW]: {
    label: 'Rev. esterna',
    color: 'text-violet-300',
    bg: 'bg-violet-950',
    border: 'border-violet-700',
  },
  [ChapterStatus.REFINEMENT]: {
    label: 'Rifinimento',
    color: 'text-cyan-300',
    bg: 'bg-cyan-950',
    border: 'border-cyan-700',
  },
  [ChapterStatus.DONE]: {
    label: 'Completato',
    color: 'text-emerald-300',
    bg: 'bg-emerald-950',
    border: 'border-emerald-700',
  },
}

export const PRIORITY_CONFIG: Record<
  Priority,
  { label: string; color: string; dot: string }
> = {
  [Priority.LOW]: { label: 'Bassa', color: 'text-slate-400', dot: 'bg-slate-400' },
  [Priority.MEDIUM]: { label: 'Media', color: 'text-blue-400', dot: 'bg-blue-400' },
  [Priority.HIGH]: { label: 'Alta', color: 'text-amber-400', dot: 'bg-amber-400' },
  [Priority.URGENT]: { label: 'Urgente', color: 'text-red-400', dot: 'bg-red-400' },
}

export const SCORE_COLORS = {
  excellent: 'text-emerald-400',
  good: 'text-blue-400',
  average: 'text-amber-400',
  poor: 'text-red-400',
} as const

export function getScoreColor(score: number): string {
  if (score >= 8) return SCORE_COLORS.excellent
  if (score >= 6) return SCORE_COLORS.good
  if (score >= 4) return SCORE_COLORS.average
  return SCORE_COLORS.poor
}

export const DEFAULT_CHECKLIST: Omit<ChecklistItem, 'id'>[] = [
  { text: 'Prima bozza completata', done: false },
  { text: 'Struttura narrativa verificata', done: false },
  { text: 'Dialoghi revisionati', done: false },
  { text: 'Descrizioni ambientazioni complete', done: false },
  { text: 'Sviluppo personaggi verificato', done: false },
  { text: 'Revisione grammaticale/ortografica', done: false },
  { text: 'Revisione stilistica', done: false },
  { text: 'Feedback esterno ricevuto', done: false },
  { text: 'Modifiche post-feedback applicate', done: false },
  { text: 'Approvazione finale', done: false },
]

export const DEFAULT_BOOK_SETTINGS: BookSettings = {
  title: 'Book Dashboard',
  subtitle: '',
  author: '',
  genre: '',
  bookType: 'generico',
  defaultAIProvider: 'claude',
  claudeModel: 'claude-sonnet-4-6',
  geminiModel: 'gemini-3.1-flash-lite-preview',
  targetWords: 80000,
  targetChapters: 20,
  startDate: new Date().toISOString(),
  targetEndDate: null,
  language: 'Italiano',
  synopsis: '',
  charsPerPage: 1800,
  wordsPerPage: 250,
  wordsPerMinuteReading: 250,
}
