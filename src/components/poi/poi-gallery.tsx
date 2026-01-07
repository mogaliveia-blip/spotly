// src/components/poi/poi-gallery.tsx
import type { POI } from '@/lib/types';
import Image from 'next/image';

interface POIGalleryProps {
  poi: POI;
}

export function POIGallery({ poi }: POIGalleryProps) {
  if (!poi.galleryUrls || poi.galleryUrls.length === 0) {
    return null;
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
      {poi.galleryUrls.map((photo, index) => (
        <div key={index} className="relative aspect-square overflow-hidden rounded-lg border">
          <Image
            src={photo.url}
            alt={`${poi.title} image de la galerie ${index + 1}`}
            fill
            className="object-cover"
            sizes="(max-width: 768px) 50vw, (max-width: 1200px) 25vw, 25vw"
          />
        </div>
      ))}
    </div>
  );
}
