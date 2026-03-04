import { deleteDoc, doc, getDoc, setDoc } from 'firebase/firestore'
import type { DriveConfig, DriveTokens } from '@/types'
import { db } from './firebase'

function configRef(uid: string) {
  return doc(db, 'driveConfig', uid)
}

export async function getDriveConfig(uid: string): Promise<DriveConfig | null> {
  const snap = await getDoc(configRef(uid))
  return snap.exists() ? (snap.data() as DriveConfig) : null
}

export async function saveDriveConfig(
  uid: string,
  data: Omit<DriveConfig, 'uid'>,
): Promise<void> {
  await setDoc(configRef(uid), { ...data, uid })
}

export async function updateDriveTokens(uid: string, tokens: DriveTokens): Promise<void> {
  await setDoc(configRef(uid), { tokens, updatedAt: new Date().toISOString() }, { merge: true })
}

export async function updateDriveFolder(
  uid: string,
  folderId: string,
  folderName: string,
): Promise<void> {
  await setDoc(
    configRef(uid),
    { folderId, folderName, updatedAt: new Date().toISOString() },
    { merge: true },
  )
}

export async function deleteDriveConfig(uid: string): Promise<void> {
  await deleteDoc(configRef(uid))
}
