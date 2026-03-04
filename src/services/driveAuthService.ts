import type { DriveConfig, DriveFile, DriveTokens } from '@/types'
import { DRIVE_ENCRYPTION_KEY_B64, GOOGLE_CLIENT_ID } from '@/utils/constants'

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const DRIVE_API_URL = 'https://www.googleapis.com/drive/v3'
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive'

const CV_KEY = 'drive_code_verifier'
const STATE_KEY = 'drive_oauth_state'

// ─── PKCE helpers ─────────────────────────────────────────────────────────────

function base64urlEncode(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let str = ''
  for (const b of bytes) str += String.fromCharCode(b)
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

function generateCodeVerifier(): string {
  const arr = new Uint8Array(32)
  crypto.getRandomValues(arr)
  return base64urlEncode(arr.buffer)
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const data = new TextEncoder().encode(verifier)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return base64urlEncode(digest)
}

// ─── AES-256-GCM encryption ───────────────────────────────────────────────────

async function getDerivedKey(uid: string): Promise<CryptoKey> {
  const enc = new TextEncoder()
  // Use VITE_DRIVE_ENCRYPTION_KEY as password; fall back to a constant for dev
  const password = DRIVE_ENCRYPTION_KEY_B64
    ? Uint8Array.from(atob(DRIVE_ENCRYPTION_KEY_B64), (c) => c.charCodeAt(0))
    : enc.encode('dev-fallback-key-do-not-use-in-prod')

  const keyMaterial = await crypto.subtle.importKey('raw', password, 'PBKDF2', false, ['deriveKey'])

  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: enc.encode(uid), iterations: 100_000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

export async function encryptToken(token: string, uid: string): Promise<string> {
  const key = await getDerivedKey(uid)
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const cipher = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(token),
  )
  const combined = new Uint8Array(12 + cipher.byteLength)
  combined.set(iv)
  combined.set(new Uint8Array(cipher), 12)
  return btoa(String.fromCharCode(...combined))
}

export async function decryptToken(encrypted: string, uid: string): Promise<string> {
  const key = await getDerivedKey(uid)
  const combined = Uint8Array.from(atob(encrypted), (c) => c.charCodeAt(0))
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: combined.slice(0, 12) },
    key,
    combined.slice(12),
  )
  return new TextDecoder().decode(decrypted)
}

// ─── OAuth flow ───────────────────────────────────────────────────────────────

export function getDriveRedirectUri(): string {
  return window.location.origin + import.meta.env.BASE_URL
}

export async function initiateDriveOAuth(): Promise<void> {
  const verifier = generateCodeVerifier()
  const challenge = await generateCodeChallenge(verifier)
  const state = base64urlEncode(crypto.getRandomValues(new Uint8Array(16)).buffer)

  sessionStorage.setItem(CV_KEY, verifier)
  sessionStorage.setItem(STATE_KEY, state)

  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: getDriveRedirectUri(),
    response_type: 'code',
    scope: DRIVE_SCOPE,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    access_type: 'offline',
    prompt: 'consent',
    state,
  })

  window.location.href = `${GOOGLE_AUTH_URL}?${params}`
}

export async function handleDriveOAuthCallback(
  code: string,
  state: string,
  uid: string,
): Promise<DriveTokens> {
  const storedState = sessionStorage.getItem(STATE_KEY)
  const verifier = sessionStorage.getItem(CV_KEY)
  sessionStorage.removeItem(CV_KEY)
  sessionStorage.removeItem(STATE_KEY)

  if (state !== storedState) throw new Error('Stato OAuth non valido')
  if (!verifier) throw new Error('Code verifier non trovato')

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      code,
      code_verifier: verifier,
      grant_type: 'authorization_code',
      redirect_uri: getDriveRedirectUri(),
    }),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Scambio token fallito: ${err}`)
  }

  const data = (await res.json()) as {
    access_token: string
    refresh_token: string
    expires_in: number
  }

  const encryptedRefreshToken = await encryptToken(data.refresh_token, uid)
  return {
    accessToken: data.access_token,
    refreshToken: encryptedRefreshToken,
    expiresAt: Date.now() + data.expires_in * 1000,
  }
}

export async function refreshDriveAccessToken(
  encryptedRefreshToken: string,
  uid: string,
): Promise<DriveTokens> {
  const refreshToken = await decryptToken(encryptedRefreshToken, uid)
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })
  if (!res.ok) throw new Error('Refresh token fallito')
  const data = (await res.json()) as { access_token: string; expires_in: number }
  return {
    accessToken: data.access_token,
    refreshToken: encryptedRefreshToken,
    expiresAt: Date.now() + data.expires_in * 1000,
  }
}

// ─── Drive API calls ──────────────────────────────────────────────────────────

export async function getValidAccessToken(
  config: DriveConfig,
  uid: string,
): Promise<{ accessToken: string; updatedTokens?: DriveTokens }> {
  // Refresh if expiring in less than 5 minutes
  if (config.tokens.expiresAt - Date.now() < 5 * 60 * 1000) {
    const newTokens = await refreshDriveAccessToken(config.tokens.refreshToken, uid)
    return { accessToken: newTokens.accessToken, updatedTokens: newTokens }
  }
  return { accessToken: config.tokens.accessToken }
}

export async function listDriveFolders(accessToken: string): Promise<DriveFile[]> {
  const params = new URLSearchParams({
    q: "mimeType='application/vnd.google-apps.folder' and trashed=false",
    fields: 'files(id,name,mimeType,modifiedTime)',
    orderBy: 'name',
    pageSize: '50',
  })
  const res = await fetch(`${DRIVE_API_URL}/files?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) throw new Error('Errore accesso a Google Drive')
  const data = (await res.json()) as { files: DriveFile[] }
  return data.files ?? []
}
