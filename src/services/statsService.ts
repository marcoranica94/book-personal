import {addDoc, collection, getDocs, orderBy, query} from 'firebase/firestore'
import {db} from './firebase'
import type {StatsSnapshot} from '@/types'

const COL = 'statsHistory'

export async function getStatsHistory(): Promise<StatsSnapshot[]> {
  const q = query(collection(db, COL), orderBy('date'))
  const snap = await getDocs(q)
  return snap.docs.map((d) => d.data() as StatsSnapshot)
}

export async function appendStatsSnapshot(snapshot: StatsSnapshot): Promise<void> {
  await addDoc(collection(db, COL), snapshot)
}
