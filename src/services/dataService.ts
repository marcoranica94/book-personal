import {getFileContent, putFileContent} from './github'
import {GITHUB_DATA_BRANCH, GITHUB_REPO_NAME, GITHUB_REPO_OWNER,} from '@/utils/constants'
import type {BookSettings, Chapter, ChapterAnalysis, StatsSnapshot,} from '@/types'
import {DEFAULT_BOOK_SETTINGS} from '@/types'

// ─── SHA Cache (avoid extra requests) ────────────────────────────────────────

const shaCache = new Map<string, string>()

// ─── Generic read/write ───────────────────────────────────────────────────────

async function readJSON<T>(path: string, fallback: T): Promise<{ data: T; sha: string }> {
  try {
    const file = await getFileContent(
      GITHUB_REPO_OWNER,
      GITHUB_REPO_NAME,
      path,
      GITHUB_DATA_BRANCH
    )
    const sha = file.sha
    shaCache.set(path, sha)
    const decoded = decodeURIComponent(escape(atob(file.content.replace(/\n/g, ''))))
    return { data: JSON.parse(decoded) as T, sha }
  } catch (err) {
    const error = err as Error
    if (error.message?.includes('404') || error.message?.includes('Not Found')) {
      return { data: fallback, sha: '' }
    }
    throw err
  }
}

async function writeJSON<T>(path: string, data: T, message: string): Promise<void> {
  const sha = shaCache.get(path) ?? null
  const content = JSON.stringify(data, null, 2)
  await putFileContent(
    GITHUB_REPO_OWNER,
    GITHUB_REPO_NAME,
    path,
    content,
    sha,
    message,
    GITHUB_DATA_BRANCH
  )
  // Refresh SHA after write
  try {
    const file = await getFileContent(
      GITHUB_REPO_OWNER,
      GITHUB_REPO_NAME,
      path,
      GITHUB_DATA_BRANCH
    )
    shaCache.set(path, file.sha)
  } catch {
    shaCache.delete(path)
  }
}

// ─── Chapters ─────────────────────────────────────────────────────────────────

export async function getAllChapters(): Promise<Chapter[]> {
  const { data } = await readJSON<Chapter[]>('chapters.json', [])
  return data
}

async function writeChapters(chapters: Chapter[]): Promise<void> {
  const count = chapters.length
  await writeJSON<Chapter[]>(
    'chapters.json',
    chapters,
    `data: update chapters (${count} capitoli)`
  )
}

export async function addChapter(chapter: Chapter): Promise<void> {
  const chapters = await getAllChapters()
  chapters.push(chapter)
  await writeChapters(chapters)
}

export async function updateChapter(id: string, updates: Partial<Chapter>): Promise<void> {
  const chapters = await getAllChapters()
  const idx = chapters.findIndex((c) => c.id === id)
  if (idx === -1) throw new Error(`Chapter ${id} not found`)
  chapters[idx] = { ...chapters[idx], ...updates, updatedAt: new Date().toISOString() }
  await writeChapters(chapters)
}

export async function deleteChapter(id: string): Promise<void> {
  const chapters = await getAllChapters()
  const filtered = chapters.filter((c) => c.id !== id)
  await writeChapters(filtered)
}

// ─── Book Settings ────────────────────────────────────────────────────────────

export async function getSettings(): Promise<BookSettings> {
  const { data } = await readJSON<BookSettings>('book-settings.json', DEFAULT_BOOK_SETTINGS)
  return data
}

export async function saveSettings(settings: BookSettings): Promise<void> {
  await writeJSON<BookSettings>('book-settings.json', settings, 'data: update book settings')
}

// ─── Stats History ────────────────────────────────────────────────────────────

export async function getStatsHistory(): Promise<StatsSnapshot[]> {
  const { data } = await readJSON<StatsSnapshot[]>('book-stats-history.json', [])
  return data
}

export async function appendStatsSnapshot(snapshot: StatsSnapshot): Promise<void> {
  const history = await getStatsHistory()
  // Replace today's entry if exists, otherwise append
  const today = snapshot.date.split('T')[0]
  const idx = history.findIndex((s) => s.date.startsWith(today))
  if (idx >= 0) {
    history[idx] = snapshot
  } else {
    history.push(snapshot)
  }
  await writeJSON<StatsSnapshot[]>(
    'book-stats-history.json',
    history,
    `data: stats snapshot ${today}`
  )
}

// ─── Analysis ─────────────────────────────────────────────────────────────────

export async function getChapterAnalysis(chapterId: string): Promise<ChapterAnalysis | null> {
  const { data } = await readJSON<ChapterAnalysis | null>(
    `analysis/chapter-${chapterId}.json`,
    null
  )
  return data
}

export async function getAllAnalysisIndex(): Promise<Record<string, string>> {
  const { data } = await readJSON<Record<string, string>>('analysis/index.json', {})
  return data
}
