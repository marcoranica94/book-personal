import {GITHUB_ACCESS_TOKEN_URL, GITHUB_CLIENT_ID, GITHUB_DEVICE_CODE_URL,} from '@/utils/constants'
import type {AccessTokenResponse, DeviceCodeResponse} from '@/types'

const SCOPE = 'repo'

export async function requestDeviceCode(): Promise<DeviceCodeResponse> {
  const res = await fetch(GITHUB_DEVICE_CODE_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ client_id: GITHUB_CLIENT_ID, scope: SCOPE }),
  })

  if (!res.ok) throw new Error(`Device code request failed: ${res.status}`)
  return res.json() as Promise<DeviceCodeResponse>
}

export async function pollForToken(
  deviceCode: string,
  interval: number,
  onProgress?: (attempt: number) => void
): Promise<string> {
  const MAX_ATTEMPTS = 60 // 5 minutes max (5s interval)
  let attempt = 0

  return new Promise((resolve, reject) => {
    const poll = async () => {
      attempt++
      onProgress?.(attempt)

      if (attempt > MAX_ATTEMPTS) {
        reject(new Error('Timeout: autorizzazione non ricevuta entro 5 minuti'))
        return
      }

      try {
        const res = await fetch(GITHUB_ACCESS_TOKEN_URL, {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            client_id: GITHUB_CLIENT_ID,
            device_code: deviceCode,
            grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
          }),
        })

        const data = (await res.json()) as AccessTokenResponse

        if (data.access_token) {
          resolve(data.access_token)
          return
        }

        switch (data.error) {
          case 'authorization_pending':
            // Normal — user hasn't authorized yet
            setTimeout(poll, interval * 1000)
            break
          case 'slow_down':
            // GitHub asks us to slow down
            setTimeout(poll, (interval + 5) * 1000)
            break
          case 'expired_token':
            reject(new Error('Il codice è scaduto. Riprova.'))
            break
          case 'access_denied':
            reject(new Error('Accesso negato dall\'utente.'))
            break
          default:
            setTimeout(poll, interval * 1000)
        }
      } catch (err) {
        // Network error — retry
        setTimeout(poll, interval * 1000)
      }
    }

    setTimeout(poll, interval * 1000)
  })
}
