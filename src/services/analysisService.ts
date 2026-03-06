import {addDoc, collection, deleteDoc, doc, getDoc, getDocs, orderBy, query, updateDoc} from 'firebase/firestore'
import {db} from './firebase'
import type {AIProvider, ChapterAnalysis} from '@/types'

const COL = 'analyses'

// ─── Multi-provider helpers ─────────────────────────────────────────────────

/** Percorso subcollection per le analisi per-provider */
function providerDocRef(chapterId: string, provider: AIProvider) {
  return doc(db, COL, chapterId, 'byProvider', provider)
}

/** Legge l'analisi di un singolo provider per un capitolo */
export async function getChapterAnalysis(
  chapterId: string,
  provider?: AIProvider,
): Promise<ChapterAnalysis | null> {
  if (provider) {
    const snap = await getDoc(providerDocRef(chapterId, provider))
    return snap.exists() ? (snap.data() as ChapterAnalysis) : null
  }
  // Retrocompatibilità: legge il vecchio doc root (pre-multi-provider)
  const snap = await getDoc(doc(db, COL, chapterId))
  return snap.exists() ? (snap.data() as ChapterAnalysis) : null
}

/** Controlla silenziosamente se esiste un'analisi più recente di `since` — NON aggiorna lo store.
 *  Usato dal polling per evitare re-render durante l'attesa. */
export async function checkAnalysisAfter(
  chapterId: string,
  since: string,
): Promise<boolean> {
  if (chapterId === 'all') {
    const chaptersSnap = await getDocs(collection(db, COL))
    for (const chapterDoc of chaptersSnap.docs) {
      const byProviderSnap = await getDocs(collection(db, chapterDoc.ref.path, 'byProvider'))
      for (const pd of byProviderSnap.docs) {
        const data = pd.data() as {analyzedAt?: string}
        if (data.analyzedAt && new Date(data.analyzedAt) > new Date(since)) return true
      }
    }
    return false
  }
  const snap = await getDocs(collection(db, COL, chapterId, 'byProvider'))
  return snap.docs.some((d) => {
    const data = d.data() as {analyzedAt?: string}
    return data.analyzedAt && new Date(data.analyzedAt) > new Date(since)
  })
}

/** Controlla silenziosamente se esiste un errore più recente di `since` */
export async function checkErrorAfter(
  chapterId: string,
  since: string,
): Promise<boolean> {
  if (chapterId === 'all') {
    const snap = await getDocs(collection(db, 'analysisErrors'))
    return snap.docs.some((d) => {
      const data = d.data() as {failedAt?: string}
      return data.failedAt && new Date(data.failedAt) > new Date(since)
    })
  }
  const errDoc = await getDoc(doc(db, 'analysisErrors', `${chapterId}_all`))
    .catch(() => null)
  // Controlla tutti i provider per questo capitolo
  const snap = await getDocs(collection(db, 'analysisErrors'))
  return snap.docs.some((d) => {
    const data = d.data() as {failedAt?: string; chapterId?: string}
    return data.chapterId === chapterId &&
      data.failedAt &&
      new Date(data.failedAt) > new Date(since)
  })
}


export async function getChapterAnalysesByProvider(
  chapterId: string,
): Promise<Record<AIProvider, ChapterAnalysis>> {
  const result = {} as Record<AIProvider, ChapterAnalysis>
  // Subcollection byProvider
  const snap = await getDocs(collection(db, COL, chapterId, 'byProvider'))
  snap.docs.forEach((d) => {
    result[d.id as AIProvider] = d.data() as ChapterAnalysis
  })
  // Retrocompatibilità: se non ci sono doc nella subcollection,
  // prova il vecchio formato (doc root senza provider field)
  if (Object.keys(result).length === 0) {
    const rootSnap = await getDoc(doc(db, COL, chapterId))
    if (rootSnap.exists()) {
      const data = rootSnap.data() as ChapterAnalysis
      const provider = data.provider ?? 'claude'
      result[provider as AIProvider] = {...data, provider: provider as AIProvider}
    }
  }
  return result
}

/** Legge tutte le analisi per tutti i capitoli — per il ranking/confronto */
export async function getAllAnalyses(): Promise<Record<string, Record<AIProvider, ChapterAnalysis>>> {
  const chaptersSnap = await getDocs(collection(db, COL))
  const result: Record<string, Record<AIProvider, ChapterAnalysis>> = {}

  for (const chapterDoc of chaptersSnap.docs) {
    const chapterId = chapterDoc.id
    const byProviderSnap = await getDocs(collection(db, COL, chapterId, 'byProvider'))

    if (byProviderSnap.empty) {
      // Retrocompatibilità: doc root
      const data = chapterDoc.data() as ChapterAnalysis
      if (data.scores) {
        const provider = data.provider ?? 'claude'
        result[chapterId] = {[provider as AIProvider]: {...data, provider: provider as AIProvider}} as Record<AIProvider, ChapterAnalysis>
      }
    } else {
      result[chapterId] = {} as Record<AIProvider, ChapterAnalysis>
      byProviderSnap.docs.forEach((d) => {
        result[chapterId][d.id as AIProvider] = d.data() as ChapterAnalysis
      })
    }
  }
  return result
}

/** Salva un'analisi per un provider specifico */
export async function saveAnalysis(
  chapterId: string,
  analysis: ChapterAnalysis,
): Promise<void> {
  const provider = analysis.provider ?? 'claude'
  const {setDoc} = await import('firebase/firestore')
  // Salva nella subcollection byProvider
  await setDoc(providerDocRef(chapterId, provider), analysis)
  // Salva anche la history
  await addDoc(collection(db, COL, chapterId, 'byProvider', provider, 'history'), analysis)
  // Aggiorna anche il doc root come cache dell'ultima analisi (per retrocompatibilità)
  await setDoc(doc(db, COL, chapterId), analysis)
}

/** Patch parziale di un'analisi per un provider specifico */
export async function patchAnalysis(
  chapterId: string,
  patch: Partial<ChapterAnalysis>,
  provider: AIProvider = 'claude',
): Promise<void> {
  await updateDoc(providerDocRef(chapterId, provider), patch as Record<string, unknown>)
  // Aggiorna anche il doc root se è lo stesso provider
  try {
    const rootSnap = await getDoc(doc(db, COL, chapterId))
    if (rootSnap.exists()) {
      const data = rootSnap.data() as ChapterAnalysis
      if ((data.provider ?? 'claude') === provider) {
        await updateDoc(doc(db, COL, chapterId), patch as Record<string, unknown>)
      }
    }
  } catch { /* non bloccante */ }
}

export async function deleteChapterAnalysis(chapterId: string): Promise<void> {
  // Elimina tutte le subcollection byProvider
  const byProviderSnap = await getDocs(collection(db, COL, chapterId, 'byProvider'))
  await Promise.all(byProviderSnap.docs.map((d) => deleteDoc(d.ref)))
  // Elimina il doc root
  await deleteDoc(doc(db, COL, chapterId))
}

/** Elimina l'analisi di un singolo provider per un capitolo */
export async function deleteProviderAnalysis(
  chapterId: string,
  provider: AIProvider,
): Promise<void> {
  await deleteDoc(providerDocRef(chapterId, provider))
  // Pulisci anche l'eventuale errore salvato
  await deleteDoc(doc(db, 'analysisErrors', `${chapterId}_${provider}`)).catch(() => {})
}

export async function deleteAllAnalyses(): Promise<void> {
  const snap = await getDocs(collection(db, COL))
  for (const d of snap.docs) {
    const byProviderSnap = await getDocs(collection(db, COL, d.id, 'byProvider'))
    await Promise.all(byProviderSnap.docs.map((pd) => deleteDoc(pd.ref)))
    await deleteDoc(d.ref)
  }
}

// ─── Analysis History ─────────────────────────────────────────────────────────

/** Legge lo storico completo delle analisi per un capitolo/provider, ordinato per data */
export async function getAnalysisHistory(
  chapterId: string,
  provider: AIProvider,
): Promise<(ChapterAnalysis & {_docId: string})[]> {
  const q = query(
    collection(db, COL, chapterId, 'byProvider', provider, 'history'),
    orderBy('analyzedAt', 'asc'),
  )
  const snap = await getDocs(q)
  return snap.docs.map((d) => ({...(d.data() as ChapterAnalysis), _docId: d.id}))
}

/** Legge lo storico di tutti i provider per un capitolo */
export async function getChapterFullHistory(
  chapterId: string,
): Promise<Record<AIProvider, (ChapterAnalysis & {_docId: string})[]>> {
  const result = {} as Record<AIProvider, (ChapterAnalysis & {_docId: string})[]>
  const byProviderSnap = await getDocs(collection(db, COL, chapterId, 'byProvider'))
  for (const providerDoc of byProviderSnap.docs) {
    const provider = providerDoc.id as AIProvider
    const histSnap = await getDocs(
      query(
        collection(db, COL, chapterId, 'byProvider', provider, 'history'),
        orderBy('analyzedAt', 'asc'),
      ),
    )
    if (!histSnap.empty) {
      result[provider] = histSnap.docs.map((d) => ({...(d.data() as ChapterAnalysis), _docId: d.id}))
    }
  }
  return result
}

/** Elimina una singola entry dello storico */
export async function deleteHistoryEntry(
  chapterId: string,
  provider: AIProvider,
  docId: string,
): Promise<void> {
  await deleteDoc(doc(db, COL, chapterId, 'byProvider', provider, 'history', docId))
}

// ─── Analysis Errors ────────────────────────────────────────────────────────

export interface AnalysisError {
  chapterId: string
  provider: string
  error: string
  failedAt: string
  model: string
}

/** Legge l'ultimo errore di analisi per un capitolo/provider */
export async function getAnalysisError(
  chapterId: string,
  provider: AIProvider,
): Promise<AnalysisError | null> {
  const snap = await getDoc(
    doc(db, COL, chapterId, 'byProvider', provider, 'errors', 'latest'),
  )
  return snap.exists() ? (snap.data() as AnalysisError) : null
}

/** Legge tutti gli errori di analisi recenti dalla collection top-level */
export async function getAllAnalysisErrors(): Promise<AnalysisError[]> {
  const snap = await getDocs(collection(db, 'analysisErrors'))
  return snap.docs.map((d) => d.data() as AnalysisError)
}

