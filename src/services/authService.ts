import {GithubAuthProvider, onAuthStateChanged, signInWithPopup, signOut} from 'firebase/auth'
import type {User} from 'firebase/auth'
import {auth} from './firebase'

const provider = new GithubAuthProvider()
provider.addScope('read:user')

export async function signInWithGitHub(): Promise<User> {
  const result = await signInWithPopup(auth, provider)
  return result.user
}

export async function signOutUser(): Promise<void> {
  await signOut(auth)
}

export function onAuthChange(callback: (user: User | null) => void): () => void {
  return onAuthStateChanged(auth, callback)
}
