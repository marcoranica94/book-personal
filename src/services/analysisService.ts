import {addDoc, collection, deleteDoc, doc, getDoc, getDocs, updateDoc} from 'firebase/firestore'
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
  const {setDoc} = await import('firebase/firestore')
  await setDoc(doc(db, COL, chapterId), analysis)
  await addDoc(collection(db, COL, chapterId, 'history'), analysis)
}

export async function patchAnalysis(
  chapterId: string,
  patch: Partial<ChapterAnalysis>,
): Promise<void> {
  await updateDoc(doc(db, COL, chapterId), patch as Record<string, unknown>)
}

export async function deleteChapterAnalysis(chapterId: string): Promise<void> {
  await deleteDoc(doc(db, COL, chapterId))
}

export async function deleteAllAnalyses(): Promise<void> {
  const snap = await getDocs(collection(db, COL))
  await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)))
}
