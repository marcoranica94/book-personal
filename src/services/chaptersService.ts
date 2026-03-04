import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  setDoc,
  updateDoc,
} from 'firebase/firestore'
import {db} from './firebase'
import type {Chapter} from '@/types'

const COL = 'chapters'

export async function getChapters(): Promise<Chapter[]> {
  const q = query(collection(db, COL), orderBy('number'))
  const snap = await getDocs(q)
  return snap.docs.map((d) => ({...d.data(), id: d.id}) as Chapter)
}

// Usa l'UUID del capitolo come ID documento Firestore
export async function addChapter(chapter: Chapter): Promise<void> {
  await setDoc(doc(db, COL, chapter.id), chapter)
}

export async function updateChapter(id: string, patch: Partial<Chapter>): Promise<void> {
  await updateDoc(doc(db, COL, id), {
    ...patch,
    updatedAt: new Date().toISOString(),
  })
}

export async function deleteChapter(id: string): Promise<void> {
  await deleteDoc(doc(db, COL, id))
}
