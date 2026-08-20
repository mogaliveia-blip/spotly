'use client'

import { useState, useCallback } from 'react'
import { Loader2, Share2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'
import { useEvent } from '@/providers/event-provider'
import { buildEventShareText, buildEventShareUrl, canShareEvent, copyTextWithFallback } from '@/lib/event-sharing'
import { cn } from '@/lib/utils'

interface EventShareButtonProps {
  className?: string
  showLabel?: boolean
}

export function EventShareButton({ className, showLabel = true }: EventShareButtonProps) {
  const { event } = useEvent()
  const { toast } = useToast()
  const [shareLoading, setShareLoading] = useState(false)

  const handleShareEvent = useCallback(async () => {
    if (!event || !canShareEvent(event) || typeof window === 'undefined') return

    const shareUrl = buildEventShareUrl(event)
    const shareText = buildEventShareText(event)

    setShareLoading(true)
    try {
      if (navigator.share) {
        await navigator.share({
          title: event.name,
          text: shareText,
          url: shareUrl,
        })
        return
      }

      await copyTextWithFallback(shareUrl)
      toast({ title: 'Lien copié' })
    } catch (error: any) {
      if (error?.name === 'AbortError') return

      toast({
        title: 'Partage indisponible',
        description: 'Impossible de copier le lien pour le moment.',
        variant: 'destructive',
      })
    } finally {
      setShareLoading(false)
    }
  }, [event, toast])

  if (!canShareEvent(event)) return null

  return (
    <Button
      type="button"
      variant="outline"
      className={cn('h-11 shrink-0 rounded-full font-bold shadow-sm', showLabel ? 'px-4' : 'w-11 px-0', className)}
      onClick={() => void handleShareEvent()}
      disabled={shareLoading}
      aria-label="Partager l'événement"
    >
      {shareLoading ? <Loader2 className={cn('h-4 w-4 animate-spin', showLabel && 'mr-2')} /> : <Share2 className={cn('h-4 w-4', showLabel && 'mr-2')} />}
      {showLabel && 'Partager'}
    </Button>
  )
}
