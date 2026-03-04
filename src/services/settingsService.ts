import {doc, getDoc, setDoc} from 'firebase/firestore'
import {db} from './firebase'
import type {BookSettings} from '@/types'
import {DEFAULT_BOOK_SETTINGS} from '@/types'

const REF = () => doc(db, 'settings', 'book')

export async function getSettings(): Promise<BookSettings> {
  const snap = await getDoc(REF())
  return snap.exists() ? (snap.data() as BookSettings) : DEFAULT_BOOK_SETTINGS
}

export async function saveSettings(settings: BookSettings): Promise<void> {
  await setDoc(REF(), settings)
}
