import {addDoc, collection, deleteDoc, doc, getDocs, orderBy, query, updateDoc} from 'firebase/firestore'
import {db} from './firebase'
import type {Character, CharacterChapterAppearance, CharacterRole} from '@/types'

export async function getAllCharacters(): Promise<Character[]> {
  const q = query(collection(db, 'characters'), orderBy('name'))
  const snap = await getDocs(q)
  return snap.docs.map((d) => ({id: d.id, ...d.data()} as Character))
}

export async function saveCharacter(character: Omit<Character, 'id'>): Promise<string> {
  const ref = await addDoc(collection(db, 'characters'), character)
  return ref.id
}

export async function updateCharacter(id: string, updates: Partial<Omit<Character, 'id'>>): Promise<void> {
  await updateDoc(doc(db, 'characters', id), {...updates, updatedAt: new Date().toISOString()})
}

export async function deleteCharacter(id: string): Promise<void> {
  await deleteDoc(doc(db, 'characters', id))
}

/**
 * Upsert characters extracted from chapter analysis.
 * Matches by name (case-insensitive). Updates chapter appearance if already present.
 */
export async function upsertCharactersFromAnalysis(
  chapterId: string,
  chapterTitle: string,
  characters: {name: string; role: string; description: string; keyMoments?: string[]}[],
): Promise<void> {
  const existing = await getAllCharacters()

  for (const c of characters) {
    const match = existing.find((e) => e.name.toLowerCase().trim() === c.name.toLowerCase().trim())
    const appearance: CharacterChapterAppearance = {
      chapterId,
      chapterTitle,
      role: c.role as CharacterRole,
      description: c.description,
      keyMoments: c.keyMoments ?? [],
    }

    if (match) {
      const appearances = match.chaptersAppearing.filter((a) => a.chapterId !== chapterId)
      appearances.push(appearance)
      await updateCharacter(match.id, {chaptersAppearing: appearances, updatedAt: new Date().toISOString()})
    } else {
      await saveCharacter({
        name: c.name,
        aliases: [],
        role: c.role as CharacterRole,
        age: '',
        physicalDescription: '',
        personalityTraits: [],
        backstory: '',
        motivation: '',
        chaptersAppearing: [appearance],
        notes: '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        extractedFromAnalysis: true,
      })
    }
  }
}
