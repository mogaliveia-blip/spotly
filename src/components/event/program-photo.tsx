'use client'

import { useEffect, useState } from 'react'
import { ImageIcon } from 'lucide-react'
import { getProgramPhotoBlob } from '@/lib/data'

export function ProgramPhoto({
  eventId, itemId, path, alt, className = '', enabled = true,
}: {
  eventId: string
  itemId: string
  path?: string
  alt: string
  className?: string
  enabled?: boolean
}) {
  const [image, setImage] = useState<{ path: string; url: string } | null>(null)

  useEffect(() => {
    if (!enabled || !path) return
    let active = true
    let objectUrl: string | null = null
    void getProgramPhotoBlob(eventId, itemId, path)
      .then((blob) => {
        if (!active) return
        objectUrl = URL.createObjectURL(blob)
        setImage({ path, url: objectUrl })
      })
      .catch(() => { if (active) setImage(null) })
    return () => {
      active = false
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [enabled, eventId, itemId, path])

  return <div className={`flex shrink-0 items-center justify-center overflow-hidden rounded-xl bg-muted/50 ${className}`}>
    {enabled && path && image?.path === path
      ? <img src={image.url} alt={alt} className="h-full w-full object-cover" />
      : <ImageIcon aria-hidden="true" className="h-6 w-6 text-muted-foreground/60" />}
  </div>
}
