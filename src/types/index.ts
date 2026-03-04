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
} as const
export type CorrectionType = (typeof CorrectionType)[keyof typeof CorrectionType]

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

export interface ChapterAnalysis {
  chapterId: string
  analyzedAt: string
  model: string
  scores: AnalysisScores
  summary: string
  strengths: string[]
  weaknesses: string[]
  suggestions: string[]
  corrections: AnalysisCorrection[]
  // Accept/reject tracking
  acceptedCorrections?: number[]  // indici delle correzioni accettate
  rejectedCorrections?: number[]  // indici delle correzioni rifiutate
  appliedAt?: string | null       // quando sono state applicate
}

export interface BookSettings {
  title: string
  subtitle: string
  author: string
  genre: string
  targetWords: number
  targetChapters: number
  startDate: string
  targetEndDate: string | null
  language: string
  synopsis: string
  charsPerPage: number
  wordsPerPage: number
  wordsPerMinuteReading: number
}

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
