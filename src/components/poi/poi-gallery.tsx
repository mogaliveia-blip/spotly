'use client';

import type { POI, POILite } from '@/lib/types';
import Image from 'next/image';

type POIAny = POI | POILite;

interface POIGalleryProps {
  poi: POIAny;
  onImageClick?: (index: number) => void;
}

function hasGallery(poi: POIAny): poi is POI {
  return Array.isArray((poi as any)?.galleryUrls);
}

export function POIGallery({ poi, onImageClick }: POIGalleryProps) {
  if (!hasGallery(poi) || !poi.galleryUrls || poi.galleryUrls.length === 0) {
    return null;
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
      {poi.galleryUrls.map((photo, index) => (
        <div
          key={index}
          className="relative aspect-square overflow-hidden rounded-lg border cursor-zoom-in"
          onClick={() => onImageClick?.(index)}
        >
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
