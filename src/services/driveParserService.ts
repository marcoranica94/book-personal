import { v4 as uuidv4 } from 'uuid'
import type { Chapter, DriveFile } from '@/types'
import { ChapterStatus, Priority } from '@/types'

// ─── Tipi interni ─────────────────────────────────────────────────────────────

export interface ParsedFrontmatter {
  number?: number
  title?: string
  status?: ChapterStatus
  priority?: Priority
  tags?: string[]
  targetChars?: number
  synopsis?: string
  notes?: string
}

export interface ParsedFile {
  meta: ParsedFrontmatter
  body: string // contenuto markdown senza il frontmatter
}

// ─── Status mapping ───────────────────────────────────────────────────────────

const STATUS_ALIASES: Record<string, ChapterStatus> = {
  // TODO
  todo: ChapterStatus.TODO,
  backlog: ChapterStatus.TODO,
  pending: ChapterStatus.TODO,
  // IN_PROGRESS
  in_progress: ChapterStatus.IN_PROGRESS,
  wip: ChapterStatus.IN_PROGRESS,
  writing: ChapterStatus.IN_PROGRESS,
  inprogress: ChapterStatus.IN_PROGRESS,
  // REVIEW
  review: ChapterStatus.REVIEW,
  checking: ChapterStatus.REVIEW,
  // EXTERNAL_REVIEW
  external: ChapterStatus.EXTERNAL_REVIEW,
  external_review: ChapterStatus.EXTERNAL_REVIEW,
  beta: ChapterStatus.EXTERNAL_REVIEW,
  // REFINEMENT
  refinement: ChapterStatus.REFINEMENT,
  polish: ChapterStatus.REFINEMENT,
  // DONE
  done: ChapterStatus.DONE,
  complete: ChapterStatus.DONE,
  completed: ChapterStatus.DONE,
  published: ChapterStatus.DONE,
}

const PRIORITY_ALIASES: Record<string, Priority> = {
  low: Priority.LOW,
  bassa: Priority.LOW,
  medium: Priority.MEDIUM,
  media: Priority.MEDIUM,
  high: Priority.HIGH,
  alta: Priority.HIGH,
  urgent: Priority.URGENT,
  urgente: Priority.URGENT,
}

function normalizeStatus(raw: string): ChapterStatus | undefined {
  return STATUS_ALIASES[raw.toLowerCase().replace(/[- ]/g, '_')]
}

function normalizePriority(raw: string): Priority | undefined {
  return PRIORITY_ALIASES[raw.toLowerCase()]
}

// ─── YAML Frontmatter parser ──────────────────────────────────────────────────

/**
 * Parsa il frontmatter YAML dal contenuto markdown.
 * Supporta:
 *   ---
 *   status: IN_PROGRESS
 *   tags: [azione, protagonista]
 *   ---
 */
export function parseYamlFrontmatter(content: string): ParsedFile {
  const trimmed = content.trimStart()

  if (!trimmed.startsWith('---')) {
    return { meta: {}, body: content }
  }

  const end = trimmed.indexOf('\n---', 3)
  if (end === -1) {
    return { meta: {}, body: content }
  }

  const yamlBlock = trimmed.slice(3, end).trim()
  const body = trimmed.slice(end + 4).trimStart()
  const meta: ParsedFrontmatter = {}

  for (const line of yamlBlock.split('\n')) {
    const colonIdx = line.indexOf(':')
    if (colonIdx === -1) continue

    const key = line.slice(0, colonIdx).trim().toLowerCase()
    const rawValue = line.slice(colonIdx + 1).trim()

    switch (key) {
      case 'number':
        meta.number = parseInt(rawValue, 10) || undefined
        break
      case 'title':
        meta.title = unquote(rawValue) || undefined
        break
      case 'status': {
        const s = normalizeStatus(rawValue)
        if (s) meta.status = s
        break
      }
      case 'priority': {
        const p = normalizePriority(rawValue)
        if (p) meta.priority = p
        break
      }
      case 'tags':
        meta.tags = parseYamlArray(rawValue)
        break
      case 'targetchars':
      case 'target_chars':
        meta.targetChars = parseInt(rawValue, 10) || undefined
        break
      case 'synopsis':
        meta.synopsis = unquote(rawValue) || undefined
        break
      case 'notes':
        meta.notes = unquote(rawValue) || undefined
        break
    }
  }

  return { meta, body }
}

/** Rimuove virgolette singole/doppie da un valore YAML */
function unquote(s: string): string {
  return s.replace(/^["']|["']$/g, '')
}

/** Parsa un array YAML inline: [a, b, c] oppure stringa singola */
function parseYamlArray(raw: string): string[] {
  const trimmed = raw.trim()
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    return trimmed
      .slice(1, -1)
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)
  }
  return trimmed ? [trimmed] : []
}

// ─── Filename convention parser ───────────────────────────────────────────────

/**
 * Estrae status, numero e titolo dal nome file.
 *
 * Pattern supportati:
 *   [IN_PROGRESS] Capitolo 3 - Il Risveglio.md
 *   01 - Titolo capitolo.md
 *   Capitolo 3.md
 *   3. Titolo.md
 */
export function parseFilename(filename: string): ParsedFrontmatter {
  // Rimuove estensione
  const base = filename.replace(/\.(md|txt)$/i, '')
  const meta: ParsedFrontmatter = {}

  // Estrae status da prefisso [STATUS]
  const bracketMatch = base.match(/^\[([^\]]+)\]\s*(.*)$/)
  if (bracketMatch) {
    const s = normalizeStatus(bracketMatch[1])
    if (s) meta.status = s
    const rest = bracketMatch[2].trim()
    const { num, title } = extractNumberAndTitle(rest)
    meta.number = num
    meta.title = title || rest || filename
    return meta
  }

  const { num, title } = extractNumberAndTitle(base)
  meta.number = num
  meta.title = title || base
  return meta
}

function extractNumberAndTitle(s: string): { num: number | undefined; title: string } {
  // "01 - Titolo" o "01. Titolo" o "1 Titolo"
  const match = s.match(/^(\d+)\s*[-.)]\s*(.+)$/)
  if (match) {
    return { num: parseInt(match[1], 10), title: match[2].trim() }
  }
  // Solo numero
  const numOnly = s.match(/^(\d+)$/)
  if (numOnly) {
    return { num: parseInt(numOnly[1], 10), title: '' }
  }
  return { num: undefined, title: s }
}

// ─── Merge e conversione ──────────────────────────────────────────────────────

/**
 * Parsa un file Drive completo in campi Chapter.
 * Priorità: frontmatter YAML > filename convention > defaults.
 */
export function parseDriveFileToChapter(
  content: string,
  driveFile: DriveFile,
): Partial<Chapter> & { driveBody: string } {
  const { meta: fmMeta, body } = parseYamlFrontmatter(content)
  const fnMeta = parseFilename(driveFile.name)

  // Merge: frontmatter ha priorità sul filename
  const title = fmMeta.title ?? fnMeta.title ?? driveFile.name
  const status = fmMeta.status ?? fnMeta.status ?? ChapterStatus.TODO
  const number = fmMeta.number ?? fnMeta.number ?? 0
  const priority = fmMeta.priority ?? Priority.MEDIUM
  const tags = fmMeta.tags ?? []
  const targetChars = fmMeta.targetChars ?? 9000
  const synopsis = fmMeta.synopsis ?? ''
  const notes = fmMeta.notes ?? ''

  // Conta caratteri del corpo
  const currentChars = body.length
  const wordCount = body.split(/\s+/).filter(Boolean).length

  const now = new Date().toISOString()

  return {
    id: uuidv4(),
    number,
    title,
    subtitle: '',
    status,
    priority,
    tags,
    targetChars,
    currentChars,
    wordCount,
    synopsis,
    notes,
    checklist: [],
    filePath: driveFile.name,
    createdAt: now,
    updatedAt: now,
    dueDate: null,
    assignedReviewer: null,
    driveBody: body,
  }
}

// ─── Inietta frontmatter ──────────────────────────────────────────────────────

/**
 * Inietta o aggiorna il frontmatter YAML nel contenuto di un file.
 * Preserva il corpo del testo.
 */
export function injectFrontmatter(body: string, chapter: Partial<Chapter>): string {
  const lines: string[] = ['---']

  if (chapter.number !== undefined) lines.push(`number: ${chapter.number}`)
  if (chapter.title) lines.push(`title: "${chapter.title}"`)
  if (chapter.status) lines.push(`status: ${chapter.status}`)
  if (chapter.priority) lines.push(`priority: ${chapter.priority}`)
  if (chapter.tags?.length) lines.push(`tags: [${chapter.tags.join(', ')}]`)
  if (chapter.targetChars) lines.push(`targetChars: ${chapter.targetChars}`)
  if (chapter.synopsis) lines.push(`synopsis: "${chapter.synopsis.replace(/"/g, "'")}"`)

  lines.push('---', '')
  return lines.join('\n') + body
}

/**
 * Genera un nome file dalla convenzione: "01 - Titolo.md"
 */
export function chapterToFilename(chapter: Partial<Chapter>): string {
  const num = String(chapter.number ?? 0).padStart(2, '0')
  const title = (chapter.title ?? 'capitolo')
    .replace(/[<>:"/\\|?*]/g, '') // rimuove caratteri non validi nei nomi file
    .trim()
  return `${num} - ${title}.md`
}
