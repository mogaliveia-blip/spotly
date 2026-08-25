import 'server-only'

import { createHash } from 'crypto'
import { getApps, initializeApp, type App } from 'firebase-admin/app'
import { getFirestore, type Timestamp } from 'firebase-admin/firestore'

import type { AppEvent, EventStatus, EventVisibility } from './types'

type EventDocumentData = {
  name?: unknown
  slug?: unknown
  description?: unknown
  eventCoverUrl?: unknown
  adminId?: unknown
  status?: unknown
  visibility?: unknown
  privatePreviewEnabled?: unknown
  createdAt?: unknown
  updatedAt?: unknown
}

type PrivateLinkDocumentData = {
  tokenHash?: unknown
  expiresAt?: unknown
  revokedAt?: unknown
}

function getAdminApp(): App {
  const existingApp = getApps()[0]
  if (existingApp) return existingApp

  return initializeApp({
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  })
}

function toDate(value: unknown): Date | undefined {
  if (value instanceof Date) return value
  if (value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') {
    return (value as Timestamp).toDate()
  }
  return undefined
}

function hashPrivateAccessToken(eventId: string, token: string): string {
  return createHash('sha256')
    .update(`${eventId}:${token}`, 'utf8')
    .digest('hex')
}

function normalizeSlug(value: string): string {
  return value.toLowerCase().trim()
}

function normalizeToken(value: string | null | undefined): string {
  return typeof value === 'string' ? value.trim() : ''
}

function isActivePrivateLink(data: PrivateLinkDocumentData, now: Date): boolean {
  const expiresAt = toDate(data.expiresAt)
  return !!expiresAt && expiresAt > now && !data.revokedAt
}

function eventFromAdminDoc(id: string, data: EventDocumentData): AppEvent {
  return {
    id,
    name: typeof data.name === 'string' ? data.name : '',
    slug: typeof data.slug === 'string' ? data.slug : '',
    description: typeof data.description === 'string' ? data.description : undefined,
    eventCoverUrl: typeof data.eventCoverUrl === 'string' ? data.eventCoverUrl : undefined,
    adminId: typeof data.adminId === 'string' ? data.adminId : '',
    status: data.status as EventStatus,
    visibility: data.visibility as EventVisibility,
    privatePreviewEnabled: typeof data.privatePreviewEnabled === 'boolean' ? data.privatePreviewEnabled : undefined,
    createdAt: toDate(data.createdAt) ?? new Date(0),
    updatedAt: toDate(data.updatedAt) ?? new Date(0),
  }
}

export async function fetchPrivateEventPreviewBySlugAndToken(
  eventSlug: string,
  privateAccessToken: string | null | undefined
): Promise<AppEvent | null> {
  const token = normalizeToken(privateAccessToken)
  if (!eventSlug || !token) return null

  const db = getFirestore(getAdminApp())
  const eventSnap = await db
    .collection('events')
    .where('slug', '==', normalizeSlug(eventSlug))
    .limit(1)
    .get()

  if (eventSnap.empty) return null

  const eventDoc = eventSnap.docs[0]
  const eventData = eventDoc.data() as EventDocumentData

  if (
    eventData.status !== 'published' ||
    eventData.visibility !== 'private' ||
    eventData.privatePreviewEnabled === false
  ) {
    return null
  }

  const tokenHash = hashPrivateAccessToken(eventDoc.id, token)
  const linkSnap = await db
    .collection(`events/${eventDoc.id}/privateLinks`)
    .where('tokenHash', '==', tokenHash)
    .limit(1)
    .get()

  if (linkSnap.empty) return null

  const now = new Date()
  const activeLink = linkSnap.docs.find((doc) => {
    return isActivePrivateLink(doc.data() as PrivateLinkDocumentData, now)
  })

  if (!activeLink) return null

  return eventFromAdminDoc(eventDoc.id, eventData)
}
