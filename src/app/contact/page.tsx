import Link from 'next/link';
import type { Metadata } from 'next';
import { ArrowLeft, Mail, MessageCircle, Mountain } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

export const metadata: Metadata = {
  title: 'Contact | Spotly',
  description: 'Parlez-nous de votre événement et découvrez comment Spotly peut vous aider à présenter ses lieux sur une carte interactive.',
  alternates: {
    canonical: 'https://spotly.anavastudio.fr/contact',
  },
}

const whatsappMessage = 'Bonjour, je viens de découvrir Spotly et je souhaiterais parler de la création d’un événement.';
const whatsappUrl = `https://wa.me/33781456221?text=${encodeURIComponent(whatsappMessage)}`;
const emailSubject = 'Projet d’événement Spotly';
const emailBody = `Bonjour,

Je viens de découvrir Spotly et je souhaiterais vous parler de mon projet d’événement.`;
const emailUrl = `mailto:contact@anavastudio.fr?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}`;

export default function ContactPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b bg-background/80 px-4 backdrop-blur-sm md:px-6">
        <Link
          href="/"
          className="inline-flex h-11 items-center gap-2 rounded-xl border bg-background/90 px-3 shadow-sm transition hover:bg-accent active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Mountain className="h-6 w-6 text-primary" />
          <span className="text-lg font-bold tracking-tight text-primary">Spotly</span>
        </Link>
      </header>

      <main className="flex flex-1 items-center px-4 py-10 md:py-16">
        <Card className="mx-auto w-full max-w-xl overflow-hidden rounded-[2rem] border-muted shadow-sm">
          <CardContent className="space-y-8 p-6 text-center sm:p-8 md:p-10">
            <Button asChild variant="ghost" size="sm" className="mx-auto rounded-xl text-muted-foreground">
              <Link href="/">
                <ArrowLeft className="h-4 w-4" />
                Retour à Spotly
              </Link>
            </Button>

            <div className="space-y-4">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <MessageCircle className="h-6 w-6" />
              </div>
              <h1 className="text-4xl font-black tracking-tighter text-foreground sm:text-5xl">
                Parlons de votre événement
              </h1>
              <p className="mx-auto max-w-md text-base font-medium leading-relaxed text-muted-foreground sm:text-lg">
                Vous préparez un événement et souhaitez utiliser Spotly ? Expliquez-nous votre projet, nous verrons ensemble comment créer votre espace.
              </p>
            </div>

            <div className="space-y-3">
              <Button asChild size="lg" className="h-12 w-full rounded-2xl font-bold shadow-sm">
                <a href={whatsappUrl} target="_blank" rel="noopener noreferrer">
                  <MessageCircle className="h-5 w-5" />
                  Discuter sur WhatsApp
                </a>
              </Button>
              <Button asChild variant="outline" size="lg" className="h-12 w-full rounded-2xl font-bold">
                <a href={emailUrl}>
                  <Mail className="h-5 w-5" />
                  Envoyer un e-mail
                </a>
              </Button>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
