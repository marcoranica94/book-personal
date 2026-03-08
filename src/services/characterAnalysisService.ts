import {collection, doc, getDoc, getDocs, orderBy, query, setDoc} from 'firebase/firestore'
import {db} from './firebase'
import type {AIProvider, CharacterAnalysis} from '@/types'

function providerRef(characterId: string, provider: AIProvider) {
  return doc(db, 'characterAnalyses', characterId, 'byProvider', provider)
}

export async function getCharacterAnalysis(characterId: string, provider: AIProvider): Promise<CharacterAnalysis | null> {
  const snap = await getDoc(providerRef(characterId, provider))
  if (!snap.exists()) return null
  return snap.data() as CharacterAnalysis
}

export async function saveCharacterAnalysis(analysis: CharacterAnalysis): Promise<void> {
  const ref = providerRef(analysis.characterId, analysis.provider)
  await setDoc(ref, analysis)
  await setDoc(doc(collection(ref, 'history'), analysis.analyzedAt.replace(/[:.]/g, '-')), analysis)
}

export async function getCharacterAnalysisHistory(characterId: string, provider: AIProvider): Promise<CharacterAnalysis[]> {
  const q = query(collection(providerRef(characterId, provider), 'history'), orderBy('analyzedAt', 'desc'))
  const snap = await getDocs(q)
  return snap.docs.map((d) => d.data() as CharacterAnalysis)
}

export async function checkCharacterAnalysisAfter(
  characterId: string,
  provider: AIProvider,
  after: string,
): Promise<CharacterAnalysis | null> {
  const analysis = await getCharacterAnalysis(characterId, provider)
  if (!analysis || analysis.analyzedAt <= after) return null
  return analysis
}

export async function getCharacterAnalysisError(characterId: string, provider: AIProvider): Promise<{error: string; failedAt: string} | null> {
  const ref = doc(db, 'characterAnalyses', characterId, 'byProvider', provider, 'errors', 'latest')
  const snap = await getDoc(ref)
  if (!snap.exists()) return null
  return snap.data() as {error: string; failedAt: string}
}
