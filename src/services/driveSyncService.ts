import type {Chapter, DriveConfig, DriveFile, DriveTokens} from '@/types'
import {SyncSource, SyncStatus} from '@/types'
import {getValidAccessToken} from './driveAuthService'
import {createDriveFile, getDriveFileContent, listDriveFiles, updateDriveFileContent,} from './driveFileService'
import {chapterToFilename, injectFrontmatter, parseDriveFileToChapter,} from './driveParserService'
import * as chaptersService from './chaptersService'

const MAX_CONTENT_BYTES = 100_000 // 100KB — limite cache Firestore

// ─── SHA-256 (Web Crypto API) ─────────────────────────────────────────────────

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('')
}

// ─── Risultato sync ───────────────────────────────────────────────────────────

export interface SyncResult {
  created: number
  updated: number
  pushed: number
  skipped: number
  deleted: number
  conflicts: number
  errors: string[]
}

// ─── Anti-loop (Layer 1-4) ────────────────────────────────────────────────────

function shouldSkipPull(chapter: Chapter, newHash: string, driveModifiedTime: string): boolean {
  // Layer 1: contenuto identico
  if (chapter.contentHash === newHash) return true
  // Layer 3: Drive modified time non cambiato
  if (chapter.driveModifiedTime === driveModifiedTime) return true
  // Layer 4: stiamo già caricando su Drive
  if (chapter.syncStatus === SyncStatus.PENDING_PUSH) return true
  // Layer 2: recente push dalla dashboard (< 60s)
  if (chapter.syncSource === SyncSource.DASHBOARD && chapter.lastSyncAt) {
    if (Date.now() - new Date(chapter.lastSyncAt).getTime() < 60_000) return true
  }
  return false
}

// ─── Token refresh callback ───────────────────────────────────────────────────

type OnTokenRefresh = (tokens: DriveTokens) => void

// ─── Pull: Drive → Firestore ──────────────────────────────────────────────────

export async function pullFromDrive(
  config: DriveConfig,
  uid: string,
  currentChapters: Chapter[],
  onTokenRefresh?: OnTokenRefresh,
): Promise<{ accessToken: string; result: SyncResult }> {
  const { accessToken, updatedTokens } = await getValidAccessToken(config, uid)
  if (updatedTokens) onTokenRefresh?.(updatedTokens)

  const driveFiles = await listDriveFiles(accessToken, config.folderId)
  const now = new Date().toISOString()
  const result: SyncResult = { created: 0, updated: 0, pushed: 0, skipped: 0, deleted: 0, conflicts: 0, errors: [] }

  for (const file of driveFiles) {
    try {
      await processDriveFile(file, accessToken, currentChapters, now, result)
    } catch (err) {
      result.errors.push(`${file.name}: ${(err as Error).message}`)
    }
  }

  // Rimuovi capitoli il cui file Drive è stato eliminato
  const driveFileIds = new Set(driveFiles.map((f) => f.id))
  for (const chapter of currentChapters) {
    if (chapter.driveFileId && !driveFileIds.has(chapter.driveFileId)) {
      try {
        await chaptersService.deleteChapter(chapter.id)
        result.deleted++
      } catch (err) {
        result.errors.push(`Elimina "${chapter.title}": ${(err as Error).message}`)
      }
    }
  }

  return { accessToken, result }
}

async function processDriveFile(
  file: DriveFile,
  accessToken: string,
  currentChapters: Chapter[],
  now: string,
  result: SyncResult,
): Promise<void> {
  const content = await getDriveFileContent(accessToken, file.id, file.mimeType)
  const truncated = content.length > MAX_CONTENT_BYTES
  const cachedContent = truncated ? content.slice(0, MAX_CONTENT_BYTES) : content
  const hash = await sha256(content)

  // Cerca il capitolo corrispondente
  const existing = currentChapters.find(
    (c) => c.driveFileId === file.id || c.driveFileName === file.name,
  )

  if (!existing) {
    // Crea nuovo capitolo da file Drive
    const { driveBody: _body, ...parsed } = parseDriveFileToChapter(content, file)
    const newChapter: Chapter = {
      ...(parsed as Chapter),
      driveFileId: file.id,
      driveFileName: file.name,
      driveMimeType: file.mimeType,
      driveWebViewLink: file.webViewLink ?? null,
      contentHash: hash,
      driveModifiedTime: file.modifiedTime,
      lastSyncAt: now,
      syncSource: SyncSource.DRIVE,
      syncStatus: SyncStatus.SYNCED,
      syncError: null,
      driveContent: cachedContent,
    }
    await chaptersService.addChapter(newChapter)
    result.created++
    return
  }

  if (shouldSkipPull(existing, hash, file.modifiedTime)) {
    result.skipped++
    return
  }

  // Conflitto: Drive cambiato E noi abbiamo modifiche locali non pushate
  if (
    existing.syncSource === SyncSource.DASHBOARD &&
    existing.syncStatus === SyncStatus.PENDING_PUSH
  ) {
    await chaptersService.updateChapter(existing.id, {
      syncStatus: SyncStatus.CONFLICT,
      driveContent: cachedContent,
      contentHash: hash,
      driveModifiedTime: file.modifiedTime,
    })
    result.conflicts++
    return
  }

  // Pull: aggiorna stats da file Drive
  const { currentChars, wordCount } = parseDriveFileToChapter(content, file)
  await chaptersService.updateChapter(existing.id, {
    currentChars,
    wordCount,
    driveFileId: file.id,
    driveFileName: file.name,
    driveMimeType: file.mimeType,
    driveWebViewLink: file.webViewLink ?? null,
    contentHash: hash,
    driveModifiedTime: file.modifiedTime,
    lastSyncAt: now,
    syncSource: SyncSource.DRIVE,
    syncStatus: SyncStatus.SYNCED,
    syncError: null,
    driveContent: cachedContent,
  })
  result.updated++
}

// ─── Push: Firestore → Drive ──────────────────────────────────────────────────

export async function pushToDrive(
  chapter: Chapter,
  config: DriveConfig,
  uid: string,
  onTokenRefresh?: OnTokenRefresh,
): Promise<void> {
  const { accessToken, updatedTokens } = await getValidAccessToken(config, uid)
  if (updatedTokens) onTokenRefresh?.(updatedTokens)

  const body = chapter.driveContent ?? ''
  const content = injectFrontmatter(body, chapter)
  const hash = await sha256(content)
  const now = new Date().toISOString()

  if (chapter.driveFileId) {
    const { modifiedTime } = await updateDriveFileContent(accessToken, chapter.driveFileId, content)
    await chaptersService.updateChapter(chapter.id, {
      contentHash: hash,
      driveModifiedTime: modifiedTime,
      lastSyncAt: now,
      syncSource: SyncSource.DASHBOARD,
      syncStatus: SyncStatus.SYNCED,
      syncError: null,
    })
  } else {
    const fileName = chapterToFilename(chapter)
    const newFile = await createDriveFile(accessToken, config.folderId, fileName, content)
    await chaptersService.updateChapter(chapter.id, {
      driveFileId: newFile.id,
      driveFileName: newFile.name,
      driveMimeType: newFile.mimeType,
      driveWebViewLink: newFile.webViewLink ?? null,
      contentHash: hash,
      driveModifiedTime: newFile.modifiedTime,
      lastSyncAt: now,
      syncSource: SyncSource.DASHBOARD,
      syncStatus: SyncStatus.SYNCED,
      syncError: null,
    })
  }
}

// ─── Full sync (pull + push pending) ─────────────────────────────────────────

export async function fullSync(
  config: DriveConfig,
  uid: string,
  currentChapters: Chapter[],
  onTokenRefresh?: OnTokenRefresh,
): Promise<SyncResult> {
  // 1. Pull Drive → Firestore
  const { result } = await pullFromDrive(config, uid, currentChapters, onTokenRefresh)

  // 2. Reload chapters post-pull
  const latest = await chaptersService.getChapters()

  // 3. Push pending dashboard chapters
  const pending = latest.filter((c) => c.syncStatus === SyncStatus.PENDING_PUSH)
  for (const chapter of pending) {
    try {
      await pushToDrive(chapter, config, uid, onTokenRefresh)
      result.pushed++
    } catch (err) {
      const msg = (err as Error).message
      result.errors.push(`Push "${chapter.title}": ${msg}`)
      await chaptersService.updateChapter(chapter.id, {
        syncStatus: SyncStatus.ERROR,
        syncError: msg,
      })
    }
  }

  return result
}

// ─── Risolvi conflitto ────────────────────────────────────────────────────────

export async function resolveConflict(
  chapter: Chapter,
  resolution: 'drive' | 'dashboard',
  config: DriveConfig,
  uid: string,
  onTokenRefresh?: OnTokenRefresh,
): Promise<void> {
  if (resolution === 'drive') {
    // Usa il contenuto Drive: aggiorna stats dal driveContent
    const content = chapter.driveContent ?? ''
    const wordCount = content.split(/\s+/).filter(Boolean).length
    await chaptersService.updateChapter(chapter.id, {
      currentChars: content.length,
      wordCount,
      syncStatus: SyncStatus.SYNCED,
      syncSource: SyncSource.DRIVE,
      syncError: null,
    })
  } else {
    // Usa il contenuto Dashboard: push allo stato corrente su Drive
    await chaptersService.updateChapter(chapter.id, {
      syncStatus: SyncStatus.PENDING_PUSH,
      syncSource: SyncSource.DASHBOARD,
    })
    await pushToDrive(chapter, config, uid, onTokenRefresh)
  }
}
