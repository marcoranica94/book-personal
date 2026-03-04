/**
 * Drive Sync Script — GitHub Actions
 *
 * Sincronizza file Google Drive ↔ Firestore.
 * Legge driveConfig da Firestore, decripta il refresh token e chiama Drive API.
 *
 * ENV:
 *   FIREBASE_SERVICE_ACCOUNT_JSON — Service Account JSON
 *   GOOGLE_CLIENT_ID              — OAuth2 Client ID
 *   DRIVE_ENCRYPTION_KEY          — Chiave AES-256 in base64 (uguale a VITE_DRIVE_ENCRYPTION_KEY)
 *   SYNC_DIRECTION                — 'pull' | 'push' | 'both' (default: 'both')
 */

import { webcrypto } from 'crypto'
import { cert, initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

const { subtle } = webcrypto

// ─── Init ─────────────────────────────────────────────────────────────────────

const SYNC_DIRECTION = process.env.SYNC_DIRECTION ?? 'both'
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? ''
const DRIVE_ENCRYPTION_KEY = process.env.DRIVE_ENCRYPTION_KEY ?? ''

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON)
initializeApp({ credential: cert(serviceAccount) })
const db = getFirestore()

const DRIVE_API = 'https://www.googleapis.com/drive/v3'
const UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3'
const MAX_CONTENT_BYTES = 100_000

// ─── AES-256-GCM (identico al browser) ───────────────────────────────────────

async function getDerivedKey(uid) {
  const enc = new TextEncoder()
  const password = DRIVE_ENCRYPTION_KEY
    ? Buffer.from(DRIVE_ENCRYPTION_KEY, 'base64')
    : enc.encode('dev-fallback-key-do-not-use-in-prod')

  const keyMaterial = await subtle.importKey('raw', password, 'PBKDF2', false, ['deriveKey'])
  return subtle.deriveKey(
    { name: 'PBKDF2', salt: enc.encode(uid), iterations: 100_000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

async function decryptToken(encrypted, uid) {
  const key = await getDerivedKey(uid)
  const combined = Buffer.from(encrypted, 'base64')
  const iv = combined.slice(0, 12)
  const cipher = combined.slice(12)
  const decrypted = await subtle.decrypt({ name: 'AES-GCM', iv }, key, cipher)
  return new TextDecoder().decode(decrypted)
}

// ─── Google Token Refresh ─────────────────────────────────────────────────────

async function refreshAccessToken(encryptedRefreshToken, uid) {
  const refreshToken = await decryptToken(encryptedRefreshToken, uid)
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })
  if (!res.ok) throw new Error(`Token refresh failed: ${await res.text()}`)
  const data = await res.json()
  return data.access_token
}

// ─── SHA-256 ──────────────────────────────────────────────────────────────────

async function sha256(text) {
  const buf = await subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('')
}

// ─── Drive API helpers ────────────────────────────────────────────────────────

const BOUNDARY = 'book_dashboard_boundary_20260304'
const MIME_QUERY =
  "(mimeType='text/markdown' or mimeType='text/plain' or mimeType='application/vnd.google-apps.document')"

async function listDriveFiles(accessToken, folderId) {
  const params = new URLSearchParams({
    q: `'${folderId}' in parents and trashed=false and ${MIME_QUERY}`,
    fields: 'files(id,name,mimeType,modifiedTime,md5Checksum,size,webViewLink)',
    orderBy: 'name',
    pageSize: '200',
  })
  const res = await fetch(`${DRIVE_API}/files?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) throw new Error(`Drive list failed: ${res.status}`)
  const data = await res.json()
  return data.files ?? []
}

async function getDriveFileContent(accessToken, fileId, mimeType) {
  const isDoc = mimeType === 'application/vnd.google-apps.document'
  const url = isDoc
    ? `${DRIVE_API}/files/${fileId}/export?mimeType=text/plain`
    : `${DRIVE_API}/files/${fileId}?alt=media`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })
  if (!res.ok) throw new Error(`Drive read failed (${fileId}): ${res.status}`)
  return res.text()
}

async function updateDriveFile(accessToken, fileId, content) {
  const body = buildMultipart({ mimeType: 'text/markdown' }, content)
  const res = await fetch(
    `${UPLOAD_API}/files/${fileId}?uploadType=multipart&fields=modifiedTime,md5Checksum`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary="${BOUNDARY}"`,
      },
      body,
    },
  )
  if (!res.ok) throw new Error(`Drive update failed (${fileId}): ${res.status}`)
  return res.json()
}

async function createDriveFile(accessToken, folderId, name, content) {
  const body = buildMultipart({ name, parents: [folderId], mimeType: 'text/markdown' }, content)
  const res = await fetch(
    `${UPLOAD_API}/files?uploadType=multipart&fields=id,name,mimeType,modifiedTime,md5Checksum,webViewLink`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary="${BOUNDARY}"`,
      },
      body,
    },
  )
  if (!res.ok) throw new Error(`Drive create failed: ${res.status}`)
  return res.json()
}

function buildMultipart(metadata, content) {
  return [
    `--${BOUNDARY}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    JSON.stringify(metadata),
    `--${BOUNDARY}`,
    'Content-Type: text/markdown',
    '',
    content,
    `--${BOUNDARY}--`,
  ].join('\r\n')
}

// ─── Firestore helpers ────────────────────────────────────────────────────────

async function getChapters() {
  const snap = await db.collection('chapters').orderBy('number').get()
  return snap.docs.map((d) => ({ ...d.data(), id: d.id }))
}

async function updateChapter(id, patch) {
  await db
    .collection('chapters')
    .doc(id)
    .update({ ...patch, updatedAt: new Date().toISOString() })
}

async function addChapter(chapter) {
  await db.collection('chapters').doc(chapter.id).set(chapter)
}

// ─── Parser minimalista (senza importare driveParserService.ts) ───────────────

function parseFilename(filename) {
  const base = filename.replace(/\.(md|txt)$/i, '')
  const bracketMatch = base.match(/^\[([^\]]+)\]\s*(.*)$/)
  const statusMap = {
    todo: 'TODO', backlog: 'TODO', pending: 'TODO',
    in_progress: 'IN_PROGRESS', wip: 'IN_PROGRESS', writing: 'IN_PROGRESS',
    review: 'REVIEW', external: 'EXTERNAL_REVIEW', refinement: 'REFINEMENT',
    done: 'DONE', complete: 'DONE', completed: 'DONE',
  }

  if (bracketMatch) {
    const status = statusMap[bracketMatch[1].toLowerCase().replace(/[- ]/g, '_')] ?? 'TODO'
    const rest = bracketMatch[2].trim()
    const numMatch = rest.match(/^(\d+)\s*[-.)]\s*(.+)$/)
    return {
      status,
      number: numMatch ? parseInt(numMatch[1], 10) : null,
      title: numMatch ? numMatch[2].trim() : rest,
    }
  }

  const numMatch = base.match(/^(\d+)\s*[-.)]\s*(.+)$/)
  return {
    status: 'TODO',
    number: numMatch ? parseInt(numMatch[1], 10) : null,
    title: numMatch ? numMatch[2].trim() : base,
  }
}

function parseYamlFrontmatter(content) {
  if (!content.trimStart().startsWith('---')) return { meta: {}, body: content }
  const trimmed = content.trimStart()
  const end = trimmed.indexOf('\n---', 3)
  if (end === -1) return { meta: {}, body: content }
  const yaml = trimmed.slice(3, end).trim()
  const body = trimmed.slice(end + 4).trimStart()
  const meta = {}
  for (const line of yaml.split('\n')) {
    const idx = line.indexOf(':')
    if (idx === -1) continue
    const key = line.slice(0, idx).trim().toLowerCase()
    const val = line.slice(idx + 1).trim().replace(/^["']|["']$/g, '')
    if (key === 'status') meta.status = val
    else if (key === 'priority') meta.priority = val
    else if (key === 'number') meta.number = parseInt(val, 10) || undefined
    else if (key === 'title') meta.title = val
    else if (key === 'targetchars' || key === 'target_chars') meta.targetChars = parseInt(val, 10) || undefined
    else if (key === 'tags') {
      if (val.startsWith('[')) meta.tags = val.slice(1, -1).split(',').map((t) => t.trim()).filter(Boolean)
      else meta.tags = [val]
    }
  }
  return { meta, body }
}

function injectFrontmatter(body, chapter) {
  const lines = ['---']
  if (chapter.number !== undefined) lines.push(`number: ${chapter.number}`)
  if (chapter.title) lines.push(`title: "${chapter.title}"`)
  if (chapter.status) lines.push(`status: ${chapter.status}`)
  if (chapter.priority) lines.push(`priority: ${chapter.priority}`)
  if (chapter.tags?.length) lines.push(`tags: [${chapter.tags.join(', ')}]`)
  if (chapter.targetChars) lines.push(`targetChars: ${chapter.targetChars}`)
  lines.push('---', '')
  return lines.join('\n') + body
}

function chapterToFilename(chapter) {
  const num = String(chapter.number ?? 0).padStart(2, '0')
  const title = (chapter.title ?? 'capitolo').replace(/[<>:"/\\|?*]/g, '').trim()
  return `${num} - ${title}.md`
}

// ─── Anti-loop ────────────────────────────────────────────────────────────────

function shouldSkipPull(chapter, newHash, driveModifiedTime) {
  if (chapter.contentHash === newHash) return true
  if (chapter.driveModifiedTime === driveModifiedTime) return true
  if (chapter.syncStatus === 'pending_push') return true
  if (chapter.syncSource === 'dashboard' && chapter.lastSyncAt) {
    if (Date.now() - new Date(chapter.lastSyncAt).getTime() < 60_000) return true
  }
  return false
}

// ─── Sync logic ───────────────────────────────────────────────────────────────

async function pullFromDrive(accessToken, folderId, chapters) {
  const driveFiles = await listDriveFiles(accessToken, folderId)
  const now = new Date().toISOString()
  let created = 0, updated = 0, skipped = 0, conflicts = 0
  const errors = []

  for (const file of driveFiles) {
    try {
      const content = await getDriveFileContent(accessToken, file.id, file.mimeType)
      const hash = await sha256(content)
      const cached = content.length > MAX_CONTENT_BYTES ? content.slice(0, MAX_CONTENT_BYTES) : content

      const existing = chapters.find(
        (c) => c.driveFileId === file.id || c.driveFileName === file.name,
      )

      if (!existing) {
        const { meta, body } = parseYamlFrontmatter(content)
        const fn = parseFilename(file.name)
        const { v4: uuidv4 } = await import('uuid')
        const newChapter = {
          id: uuidv4(),
          number: meta.number ?? fn.number ?? 0,
          title: meta.title ?? fn.title ?? file.name,
          subtitle: '',
          status: meta.status ?? fn.status ?? 'TODO',
          priority: meta.priority ?? 'MEDIUM',
          tags: meta.tags ?? [],
          targetChars: meta.targetChars ?? 9000,
          currentChars: body.length,
          wordCount: body.split(/\s+/).filter(Boolean).length,
          synopsis: '',
          notes: '',
          checklist: [],
          filePath: file.name,
          createdAt: now,
          updatedAt: now,
          dueDate: null,
          assignedReviewer: null,
          driveFileId: file.id,
          driveFileName: file.name,
          driveMimeType: file.mimeType,
          driveWebViewLink: file.webViewLink ?? null,
          contentHash: hash,
          driveModifiedTime: file.modifiedTime,
          lastSyncAt: now,
          syncSource: 'drive',
          syncStatus: 'synced',
          syncError: null,
          driveContent: cached,
        }
        await addChapter(newChapter)
        created++
        continue
      }

      if (shouldSkipPull(existing, hash, file.modifiedTime)) { skipped++; continue }

      if (existing.syncSource === 'dashboard' && existing.syncStatus === 'pending_push') {
        await updateChapter(existing.id, { syncStatus: 'conflict', driveContent: cached, contentHash: hash, driveModifiedTime: file.modifiedTime })
        conflicts++
        continue
      }

      const { body } = parseYamlFrontmatter(content)
      await updateChapter(existing.id, {
        currentChars: body.length,
        wordCount: body.split(/\s+/).filter(Boolean).length,
        driveFileId: file.id,
        driveFileName: file.name,
        driveMimeType: file.mimeType,
        driveWebViewLink: file.webViewLink ?? null,
        contentHash: hash,
        driveModifiedTime: file.modifiedTime,
        lastSyncAt: now,
        syncSource: 'drive',
        syncStatus: 'synced',
        syncError: null,
        driveContent: cached,
      })
      updated++
    } catch (err) {
      errors.push(`${file.name}: ${err.message}`)
    }
  }

  return { created, updated, skipped, conflicts, errors }
}

async function pushPendingChapters(accessToken, folderId, chapters) {
  const pending = chapters.filter((c) => c.syncStatus === 'pending_push')
  let pushed = 0
  const errors = []
  const now = new Date().toISOString()

  for (const chapter of pending) {
    try {
      const body = chapter.driveContent ?? ''
      const content = injectFrontmatter(body, chapter)
      const hash = await sha256(content)

      if (chapter.driveFileId) {
        const { modifiedTime } = await updateDriveFile(accessToken, chapter.driveFileId, content)
        await updateChapter(chapter.id, { contentHash: hash, driveModifiedTime: modifiedTime, lastSyncAt: now, syncSource: 'dashboard', syncStatus: 'synced', syncError: null })
      } else {
        const fileName = chapterToFilename(chapter)
        const newFile = await createDriveFile(accessToken, folderId, fileName, content)
        await updateChapter(chapter.id, {
          driveFileId: newFile.id, driveFileName: newFile.name, driveMimeType: newFile.mimeType,
          driveWebViewLink: newFile.webViewLink ?? null, contentHash: hash,
          driveModifiedTime: newFile.modifiedTime, lastSyncAt: now,
          syncSource: 'dashboard', syncStatus: 'synced', syncError: null,
        })
      }
      pushed++
    } catch (err) {
      errors.push(`Push "${chapter.title}": ${err.message}`)
      await updateChapter(chapter.id, { syncStatus: 'error', syncError: err.message })
    }
  }

  return { pushed, errors }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const configSnap = await db.collection('driveConfig').get()
  if (configSnap.empty) {
    console.log('Nessuna configurazione Drive trovata, skip.')
    return
  }

  for (const configDoc of configSnap.docs) {
    const config = configDoc.data()
    const uid = config.uid ?? configDoc.id

    if (!config.folderId || !config.tokens?.refreshToken) {
      console.log(`[${uid}] Configurazione incompleta, skip.`)
      continue
    }

    console.log(`[${uid}] Avvio sync (direzione: ${SYNC_DIRECTION})...`)

    try {
      const accessToken = await refreshAccessToken(config.tokens.refreshToken, uid)
      const chapters = await getChapters()

      let totalCreated = 0, totalUpdated = 0, totalPushed = 0, totalConflicts = 0
      const totalErrors = []

      if (SYNC_DIRECTION !== 'push') {
        const r = await pullFromDrive(accessToken, config.folderId, chapters)
        totalCreated = r.created
        totalUpdated = r.updated
        totalConflicts = r.conflicts
        totalErrors.push(...r.errors)
        console.log(`  Pull: ${r.created} creati, ${r.updated} aggiornati, ${r.skipped} saltati, ${r.conflicts} conflitti`)
      }

      if (SYNC_DIRECTION !== 'pull') {
        const freshChapters = await getChapters()
        const r = await pushPendingChapters(accessToken, config.folderId, freshChapters)
        totalPushed = r.pushed
        totalErrors.push(...r.errors)
        console.log(`  Push: ${r.pushed} capitoli caricati`)
      }

      if (totalErrors.length) {
        console.error('  Errori:', totalErrors)
      }
      console.log(`[${uid}] Sync completata. Creati: ${totalCreated}, Aggiornati: ${totalUpdated}, Caricati: ${totalPushed}, Conflitti: ${totalConflicts}`)
    } catch (err) {
      console.error(`[${uid}] Errore sync:`, err.message)
    }
  }
}

main().catch((err) => {
  console.error('Errore fatale:', err)
  process.exit(1)
})
