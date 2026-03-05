import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {applyTextReplacements} from './googleDocsService'

// ─── Mock fetch ───────────────────────────────────────────────────────────────

const mockFetch = vi.fn()
beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch)
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

function mockOk(replies: Array<{replaceAllText?: {occurrencesChanged?: number}}>) {
  mockFetch.mockResolvedValue({
    ok: true,
    json: async () => ({replies}),
  })
}

function mockError(status: number, message: string) {
  mockFetch.mockResolvedValue({
    ok: false,
    status,
    json: async () => ({error: {message}}),
  })
}

// ─── Test ─────────────────────────────────────────────────────────────────────

describe('applyTextReplacements', () => {
  it('restituisce applied=0 se array vuoto senza chiamare fetch', async () => {
    const {applied} = await applyTextReplacements('token', 'doc-id', [])
    expect(applied).toBe(0)
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('conta le occorrenze cambiate', async () => {
    mockOk([
      {replaceAllText: {occurrencesChanged: 2}},
      {replaceAllText: {occurrencesChanged: 1}},
    ])
    const {applied} = await applyTextReplacements('token', 'doc-id', [
      {original: 'cane', suggested: 'gatto'},
      {original: 'casa', suggested: 'palazzo'},
    ])
    expect(applied).toBe(3)
  })

  it('gestisce replies senza occurrencesChanged (testo non trovato = 0)', async () => {
    mockOk([{replaceAllText: {}}, {replaceAllText: {occurrencesChanged: 1}}])
    const {applied} = await applyTextReplacements('token', 'doc-id', [
      {original: 'assente', suggested: 'x'},
      {original: 'presente', suggested: 'y'},
    ])
    expect(applied).toBe(1)
  })

  it('replies vuote restituiscono 0', async () => {
    mockOk([])
    const {applied} = await applyTextReplacements('token', 'doc-id', [
      {original: 'x', suggested: 'y'},
    ])
    expect(applied).toBe(0)
  })

  it('lancia errore se la risposta non e ok', async () => {
    mockError(403, 'The caller does not have permission')
    await expect(
      applyTextReplacements('token', 'doc-id', [{original: 'x', suggested: 'y'}]),
    ).rejects.toThrow('The caller does not have permission')
  })

  it('invia Authorization header corretto', async () => {
    mockOk([{replaceAllText: {occurrencesChanged: 0}}])
    await applyTextReplacements('my-token', 'doc-123', [{original: 'x', suggested: 'y'}])
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('doc-123'),
      expect.objectContaining({
        headers: expect.objectContaining({Authorization: 'Bearer my-token'}),
      }),
    )
  })

  it('invia i requests in formato corretto', async () => {
    mockOk([{replaceAllText: {occurrencesChanged: 1}}])
    await applyTextReplacements('t', 'doc', [{original: 'vecchio', suggested: 'nuovo'}])
    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body.requests[0]).toEqual({
      replaceAllText: {
        containsText: {text: 'vecchio', matchCase: true},
        replaceText: 'nuovo',
      },
    })
  })
})
