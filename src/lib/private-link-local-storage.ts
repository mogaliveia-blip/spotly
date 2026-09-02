export const PRIVATE_LINKS_STORAGE_KEY = 'uninstantici.privateLinks'

export interface LocalPrivateLink {
  eventId: string
  linkId: string
  shareUrl: string
}

interface StoredPrivateLinks {
  version: 1
  links: LocalPrivateLink[]
}

function getLocalStorage(): Storage | null {
  if (typeof window === 'undefined') return null

  try {
    return window.localStorage
  } catch {
    return null
  }
}

function isLocalPrivateLink(value: unknown): value is LocalPrivateLink {
  if (!value || typeof value !== 'object') return false

  const candidate = value as Partial<LocalPrivateLink>
  return typeof candidate.eventId === 'string'
    && candidate.eventId.trim().length > 0
    && typeof candidate.linkId === 'string'
    && candidate.linkId.trim().length > 0
    && typeof candidate.shareUrl === 'string'
    && candidate.shareUrl.trim().length > 0
}

function readStoredPrivateLinks(storage: Storage): LocalPrivateLink[] {
  try {
    const rawValue = storage.getItem(PRIVATE_LINKS_STORAGE_KEY)
    if (!rawValue) return []

    const parsed = JSON.parse(rawValue) as Partial<StoredPrivateLinks>
    if (parsed.version !== 1 || !Array.isArray(parsed.links)) return []

    return parsed.links.filter(isLocalPrivateLink).map((link) => ({
      eventId: link.eventId.trim(),
      linkId: link.linkId.trim(),
      shareUrl: link.shareUrl.trim()
    }))
  } catch {
    return []
  }
}

function writeStoredPrivateLinks(storage: Storage, links: LocalPrivateLink[]): boolean {
  try {
    const value: StoredPrivateLinks = { version: 1, links }
    storage.setItem(PRIVATE_LINKS_STORAGE_KEY, JSON.stringify(value))
    return true
  } catch {
    return false
  }
}

export function getStoredPrivateLinksForEvent(eventId: string): LocalPrivateLink[] {
  const storage = getLocalStorage()
  if (!storage || !eventId) return []

  return readStoredPrivateLinks(storage).filter((link) => link.eventId === eventId)
}

export function storePrivateLinkOnDevice(link: LocalPrivateLink): boolean {
  const storage = getLocalStorage()
  if (!storage || !isLocalPrivateLink(link)) return false

  const normalizedLink: LocalPrivateLink = {
    eventId: link.eventId.trim(),
    linkId: link.linkId.trim(),
    shareUrl: link.shareUrl.trim()
  }
  const otherLinks = readStoredPrivateLinks(storage).filter((storedLink) => (
    storedLink.eventId !== normalizedLink.eventId || storedLink.linkId !== normalizedLink.linkId
  ))

  return writeStoredPrivateLinks(storage, [...otherLinks, normalizedLink])
}

export function forgetPrivateLinkOnDevice(eventId: string, linkId: string): boolean {
  const storage = getLocalStorage()
  if (!storage || !eventId || !linkId) return false

  const remainingLinks = readStoredPrivateLinks(storage).filter((link) => (
    link.eventId !== eventId || link.linkId !== linkId
  ))

  return writeStoredPrivateLinks(storage, remainingLinks)
}
