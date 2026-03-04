import {addDoc, collection, doc, getDoc, getDocs} from 'firebase/firestore'
import {db} from './firebase'
import type {ChapterAnalysis} from '@/types'

const COL = 'analyses'

export async function getChapterAnalysis(chapterId: string): Promise<ChapterAnalysis | null> {
  const snap = await getDoc(doc(db, COL, chapterId))
  return snap.exists() ? (snap.data() as ChapterAnalysis) : null
}

export async function getAllAnalyses(): Promise<Record<string, ChapterAnalysis>> {
  const snap = await getDocs(collection(db, COL))
  const result: Record<string, ChapterAnalysis> = {}
  snap.docs.forEach((d) => {
    result[d.id] = d.data() as ChapterAnalysis
  })
  return result
}

export async function saveAnalysis(chapterId: string, analysis: ChapterAnalysis): Promise<void> {
  // Salva come documento principale (ultima analisi)
  const {setDoc} = await import('firebase/firestore')
  await setDoc(doc(db, COL, chapterId), analysis)
  // Salva anche nello storico
  await addDoc(collection(db, COL, chapterId, 'history'), analysis)
}
