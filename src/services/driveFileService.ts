import type {DriveFile} from '@/types'

const DRIVE_API = 'https://www.googleapis.com/drive/v3'
const UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3'

// MIME types supportati (markdown, testo plain, Google Docs, Word .docx)
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
const SUPPORTED_MIME_QUERY =
  `(mimeType='text/markdown' or mimeType='text/plain' or mimeType='application/vnd.google-apps.document' or mimeType='${DOCX_MIME}')`

// Multipart boundary stabile
const BOUNDARY = 'book_dashboard_boundary_20260304'

// ─── Lettura ──────────────────────────────────────────────────────────────────

/**
 * Lista tutti i file .md/.txt/Google Docs in una cartella Drive.
 */
export async function listDriveFiles(
  accessToken: string,
  folderId: string,
): Promise<DriveFile[]> {
  const params = new URLSearchParams({
    q: `'${folderId}' in parents and trashed=false and ${SUPPORTED_MIME_QUERY}`,
    fields: 'files(id,name,mimeType,modifiedTime,md5Checksum,size,webViewLink)',
    orderBy: 'name',
    pageSize: '200',
  })

  const res = await fetch(`${DRIVE_API}/files?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) throw new Error(`Errore lista file Drive: ${res.status}`)
  const data = (await res.json()) as { files: DriveFile[] }
  return data.files ?? []
}

const GOOGLE_DOC_MIME = 'application/vnd.google-apps.document'

/**
 * Scarica il contenuto testuale di un file Drive.
 * Google Docs vengono esportati come text/markdown per preservare grassetti, heading, a capo.
 * .docx vengono esportati come text/plain.
 */
export async function getDriveFileContent(
  accessToken: string,
  fileId: string,
  mimeType: string,
): Promise<string> {
  let url: string
  if (mimeType === GOOGLE_DOC_MIME) {
    url = `${DRIVE_API}/files/${fileId}/export?mimeType=text/markdown`
  } else if (mimeType === DOCX_MIME) {
    url = `${DRIVE_API}/files/${fileId}/export?mimeType=text/plain`
  } else {
    url = `${DRIVE_API}/files/${fileId}?alt=media`
  }

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) throw new Error(`Errore lettura file Drive (${fileId}): ${res.status}`)
  return res.text()
}

export { GOOGLE_DOC_MIME }

/**
 * Legge i metadati di un singolo file.
 */
export async function getDriveFileMeta(
  accessToken: string,
  fileId: string,
): Promise<DriveFile> {
  const params = new URLSearchParams({
    fields: 'id,name,mimeType,modifiedTime,md5Checksum,size,webViewLink',
  })
  const res = await fetch(`${DRIVE_API}/files/${fileId}?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) throw new Error(`Errore metadati file Drive (${fileId}): ${res.status}`)
  return res.json() as Promise<DriveFile>
}

// ─── Scrittura ────────────────────────────────────────────────────────────────

/**
 * Aggiorna il contenuto di un file Drive esistente (multipart).
 * Restituisce il modifiedTime aggiornato.
 */
export async function updateDriveFileContent(
  accessToken: string,
  fileId: string,
  content: string,
): Promise<{ modifiedTime: string; md5Checksum: string }> {
  const body = buildMultipartBody({ mimeType: 'text/markdown' }, content)

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
  if (!res.ok) throw new Error(`Errore aggiornamento file Drive (${fileId}): ${res.status}`)
  return res.json() as Promise<{ modifiedTime: string; md5Checksum: string }>
}

/**
 * Crea un nuovo file .md in una cartella Drive.
 */
export async function createDriveFile(
  accessToken: string,
  folderId: string,
  fileName: string,
  content: string,
): Promise<DriveFile> {
  const metadata = { name: fileName, parents: [folderId], mimeType: 'text/markdown' }
  const body = buildMultipartBody(metadata, content)

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
  if (!res.ok) throw new Error(`Errore creazione file Drive: ${res.status}`)
  return res.json() as Promise<DriveFile>
}

// ─── Helper ───────────────────────────────────────────────────────────────────

function buildMultipartBody(metadata: object, content: string): string {
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
