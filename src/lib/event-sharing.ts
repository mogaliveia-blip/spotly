import type { AppEvent } from './types'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://spotly.anavastudio.fr'

type ShareableEvent = Pick<AppEvent, 'name' | 'slug' | 'description' | 'status' | 'visibility'>

export function canShareEvent(event: Pick<AppEvent, 'status' | 'visibility'> | null | undefined): boolean {
  return event?.status === 'published' && event.visibility === 'public'
}

export function buildEventShareUrl(event: Pick<AppEvent, 'slug'>): string {
  return new URL(`/${event.slug}/dashboard`, SITE_URL).toString()
}

export function buildEventShareText(event: ShareableEvent): string {
  const description = event.description?.trim()
  return description ? `${event.name}\n\n${description}` : `Découvrez ${event.name} sur Spotly.`
}

export async function copyTextWithFallback(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }

  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.top = '-9999px'
  textarea.style.left = '-9999px'
  document.body.appendChild(textarea)
  textarea.select()

  try {
    const copied = document.execCommand('copy')
    if (!copied) throw new Error('COPY_COMMAND_FAILED')
  } finally {
    document.body.removeChild(textarea)
  }
}
