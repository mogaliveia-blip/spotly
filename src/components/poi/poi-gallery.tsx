// src/components/poi/poi-gallery.tsx
import type { POI } from '@/lib/types';
import Image from 'next/image';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface POIGalleryProps {
  poi: POI;
}

export function POIGallery({ poi }: POIGalleryProps) {
  if (!poi.galleryUrls || poi.galleryUrls.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Gallery</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {poi.galleryUrls.map((photo, index) => (
            <div key={index} className="relative aspect-square overflow-hidden rounded-lg border">
              <Image
                src={photo.url}
                alt={`${poi.title} gallery image ${index + 1}`}
                fill
                className="object-cover"
                sizes="(max-width: 768px) 50vw, (max-width: 1200px) 25vw, 25vw"
                data-ai-hint={photo.hint}
              />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
