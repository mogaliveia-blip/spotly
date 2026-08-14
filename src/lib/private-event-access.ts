import { onAuthStateChanged, signInAnonymously, type User } from 'firebase/auth'
import { httpsCallable } from 'firebase/functions'

import { auth, functions } from './firebase'

const PRIVATE_ACCESS_PARAM = 'privateAccess'

type RotatePrivateEventTokenResult = {
  token: string
  accessVersion: number
  grantDurationSeconds: number
}

type RedeemPrivateEventAccessResult = {
  eventId: string
  expiresAt: string
  accessVersion: number
}

export function getPrivateAccessTokenFromUrl(): string | null {
  if (typeof window === 'undefined') return null

  const token = new URLSearchParams(window.location.search).get(PRIVATE_ACCESS_PARAM)
  return token?.trim() || null
}

export function removePrivateAccessTokenFromUrl(): void {
  if (typeof window === 'undefined') return

  const url = new URL(window.location.href)
  if (!url.searchParams.has(PRIVATE_ACCESS_PARAM)) return

  url.searchParams.delete(PRIVATE_ACCESS_PARAM)
  window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`)
}

export function buildPrivateEventUrl(eventSlug: string, token: string, origin: string): string {
  const url = new URL(`/${eventSlug}/dashboard`, origin)
  url.searchParams.set(PRIVATE_ACCESS_PARAM, token)
  return url.toString()
}

async function ensurePrivateAccessUserUid(): Promise<string> {
  const initialUser = await waitForInitialAuthUser()
  if (initialUser) return initialUser.uid

  const credential = await signInAnonymously(auth)
  return credential.user.uid
}

function waitForInitialAuthUser(): Promise<User | null> {
  if (auth.currentUser) return Promise.resolve(auth.currentUser)

  return new Promise((resolve) => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      unsubscribe()
      resolve(user)
    })
  })
}

export async function redeemPrivateEventAccess(eventSlug: string, token: string): Promise<RedeemPrivateEventAccessResult> {
  await ensurePrivateAccessUserUid()

  const redeem = httpsCallable<{ eventSlug: string; token: string }, RedeemPrivateEventAccessResult>(
    functions,
    'redeemPrivateEventAccess'
  )
  const result = await redeem({ eventSlug, token })
  return result.data
}

export async function rotatePrivateEventToken(eventId: string): Promise<RotatePrivateEventTokenResult> {
  const rotate = httpsCallable<{ eventId: string }, RotatePrivateEventTokenResult>(
    functions,
    'rotatePrivateEventToken'
  )
  const result = await rotate({ eventId })
  return result.data
}

export async function revokePrivateEventToken(eventId: string): Promise<void> {
  const revoke = httpsCallable<{ eventId: string }, { revoked: boolean }>(
    functions,
    'revokePrivateEventToken'
  )
  await revoke({ eventId })
}
