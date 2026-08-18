'use client';

import Image from 'next/image';
import { Mountain, QrCode } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

export function SpotlyQrReminder() {
  return (
    <section className="mx-auto w-full max-w-2xl" aria-labelledby="spotly-qr-title">
      <Card className="overflow-hidden rounded-[2rem] border-muted bg-card shadow-sm">
        <CardContent className="space-y-4 p-5 text-center">
          <div className="mx-auto inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-bold uppercase tracking-widest text-primary">
            <Mountain className="h-3.5 w-3.5" />
            Spotly mobile
          </div>
          <div className="space-y-2">
            <h2 id="spotly-qr-title" className="text-xl font-black tracking-tight">
              Spotly sur votre téléphone
            </h2>
            <p className="text-sm font-medium leading-relaxed text-muted-foreground">
              Scannez le QR Code pour découvrir les événements près de chez vous et installer Spotly sur votre écran d'accueil.
            </p>
          </div>

          <Dialog>
            <DialogTrigger asChild>
              <Button type="button" variant="outline" className="h-11 rounded-2xl font-bold">
                <QrCode className="h-4 w-4" />
                Voir le QR code
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-[calc(100vw-2rem)] rounded-[2rem] p-5">
              <DialogHeader className="text-center">
                <DialogTitle className="text-2xl font-black tracking-tight">
                  QR code Spotly
                </DialogTitle>
                <DialogDescription>
                  Scannez ce QR code depuis un autre appareil pour ouvrir Spotly.
                </DialogDescription>
              </DialogHeader>
              <div className="mx-auto rounded-3xl border bg-white p-4 shadow-sm">
                <Image
                  src="/spotly-qr-code.png"
                  alt="QR Code officiel Spotly vers https://spotly.anavastudio.fr/"
                  width={220}
                  height={220}
                  className="h-[220px] w-[220px]"
                />
              </div>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>
    </section>
  );
}
