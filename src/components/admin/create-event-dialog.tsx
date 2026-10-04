'use client';

import { useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { createEventDraft, CreateEventDraftClientError } from '@/lib/event-drafts';
import { normalizeEventSlug } from '@/lib/event-invariants';
import { isCalendarDay, isIanaTimezone } from '@/lib/event-time';
import { useAuth } from '@/hooks/use-auth-user';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import { Loader2, PlusCircle } from 'lucide-react';
import { canCreateEvent } from '@/lib/access-control';

const formSchema = z.object({
  name: z.string().min(3, 'Le nom doit faire au moins 3 caractères').max(120, 'Le nom est trop long'),
  slug: z.string().min(3, 'Le slug doit faire au moins 3 caractères').max(80, 'Le slug est trop long').regex(/^[a-z0-9-]+$/, 'Slug invalide (minuscules, chiffres et tirets uniquement)'),
  startDay: z.string().refine(isCalendarDay, 'Date de début invalide'),
  endDay: z.string().refine(isCalendarDay, 'Date de fin invalide'),
  timezone: z.string().trim().refine(isIanaTimezone, 'Fuseau horaire IANA invalide'),
  city: z.string().max(80, 'Ville trop longue').optional(),
  departmentName: z.string().max(80, 'Département trop long').optional(),
  region: z.string().max(80, 'Région trop longue').optional(),
  country: z.string().max(80, 'Pays trop long').optional(),
}).refine((data) => {
  return data.startDay <= data.endDay;
}, { message: 'La date de fin doit être postérieure à la date de début', path: ['endDay'] });

function optionalText(value?: string): string | undefined {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

interface CreateEventDialogProps {
  onEventCreated?: () => void;
}

export function CreateEventDialog({ onEventCreated }: CreateEventDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const requestIdRef = useRef<string | null>(null);
  const { user, firebaseUser, role: globalRole } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const canCreate = !!firebaseUser && !firebaseUser.isAnonymous && canCreateEvent(globalRole);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      slug: '',
      startDay: '',
      endDay: '',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Paris',
      city: '',
      departmentName: '',
      region: '',
      country: 'France'
    },
  });

  const onNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    form.setValue('name', val);
    const slug = normalizeEventSlug(val);
    form.setValue('slug', slug, { shouldValidate: true });
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && !loading) requestIdRef.current = null;
    setOpen(nextOpen);
  };

  async function onSubmit(values: z.infer<typeof formSchema>) {
    if (!user || !canCreate) return;
    requestIdRef.current ??= crypto.randomUUID();
    setLoading(true);
    try {
      await firebaseUser.getIdToken(true);
      await createEventDraft({
        requestId: requestIdRef.current,
        name: values.name,
        slug: values.slug,
        startDay: values.startDay,
        endDay: values.endDay,
        timezone: values.timezone,
        city: optionalText(values.city),
        departmentName: optionalText(values.departmentName),
        region: optionalText(values.region),
        country: optionalText(values.country)
      });
      requestIdRef.current = null;
      toast({ title: 'Événement créé !', description: `L'événement ${values.name} est prêt en brouillon privé.` });
      setOpen(false);
      if (onEventCreated) onEventCreated();
      router.push(`/admin/events`);
    } catch (error) {
      const reason = error instanceof CreateEventDraftClientError ? error.reason : 'EVENT_CREATE_FAILED';
      const descriptions: Record<string, string> = {
        EMAIL_VERIFICATION_REQUIRED: 'Vérifiez votre adresse e-mail avant de créer un événement.',
        FREE_DRAFT_EXISTS: 'Vous disposez déjà d’un brouillon gratuit actif.',
        SLUG_TAKEN: 'Cette adresse est déjà utilisée. Choisissez un autre slug.',
        INVALID_DATES: 'Vérifiez les dates de début et de fin.',
        UNAUTHENTICATED: 'Votre session a expiré. Reconnectez-vous puis réessayez.',
        USER_PROFILE_REQUIRED: 'Votre profil utilisateur doit être initialisé avant la création.',
        EVENT_CREATE_FORBIDDEN: 'Ce compte n’est pas autorisé à créer un événement.',
        INVALID_NAME: 'Vérifiez le nom de l’événement.',
        INVALID_SLUG: 'Vérifiez le slug de l’événement.',
        INVALID_TIMEZONE: 'Vérifiez le fuseau horaire.',
        INVALID_PAYLOAD: 'Certaines informations du formulaire sont invalides.',
        INVALID_REQUEST_ID: 'La demande de création est invalide. Fermez puis rouvrez le formulaire.',
        REQUEST_ID_CONFLICT: 'Cette demande de création est déjà utilisée.',
        EVENT_CREATE_FAILED: 'Impossible de créer l’événement pour le moment.'
      };
      toast({ title: 'Création impossible', description: descriptions[reason], variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }

  if (!canCreate) return null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button className="gap-2 rounded-2xl font-bold shadow-sm">
          <PlusCircle className="h-4 w-4" />
          Créer un événement
        </Button>
      </DialogTrigger>
      <DialogContent className="flex max-h-[90vh] flex-col overflow-hidden rounded-[2rem] sm:max-w-[640px]">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold">Nouvel Événement</DialogTitle>
          <DialogDescription>
            Créez un espace dédié pour votre festival ou rassemblement.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-1 py-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nom de l'événement</FormLabel>
                    <FormControl>
                      <Input placeholder="Ex: Festival Leu Tempo 2025" {...field} onChange={onNameChange} className="rounded-xl" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="slug"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Slug (URL)</FormLabel>
                    <FormControl>
                      <div className="flex items-center gap-1 text-sm text-muted-foreground bg-muted/50 p-2 rounded-xl border border-input">
                        <span className="shrink-0">/</span>
                        <Input className="h-7 border-none bg-transparent focus-visible:ring-0 p-0 font-mono" {...field} />
                      </div>
                    </FormControl>
                    <FormDescription>Identifiant unique dans l'adresse web.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="startDay"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Date de début</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} className="rounded-xl" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="endDay"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Date de fin</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} className="rounded-xl" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <p className="rounded-xl border bg-muted/40 p-3 text-sm text-muted-foreground">
                Le nouvel événement sera créé comme brouillon privé. Vous pourrez modifier sa visibilité plus tard.
              </p>
              <FormField
                control={form.control}
                name="timezone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Fuseau horaire</FormLabel>
                    <FormControl>
                      <Input placeholder="Europe/Paris" {...field} className="rounded-xl" />
                    </FormControl>
                    <FormDescription>Utilisé pour classer l'événement dans les vues publiques.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="city"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Ville</FormLabel>
                      <FormControl>
                        <Input placeholder="Lorient" {...field} className="rounded-xl" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="departmentName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Département</FormLabel>
                      <FormControl>
                        <Input placeholder="Morbihan" {...field} className="rounded-xl" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="region"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Région</FormLabel>
                      <FormControl>
                        <Input placeholder="Bretagne" {...field} className="rounded-xl" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="country"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Pays</FormLabel>
                      <FormControl>
                        <Input placeholder="France" {...field} className="rounded-xl" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>
            <div className="flex shrink-0 justify-end border-t bg-background pt-4">
              <Button type="submit" disabled={loading} className="w-full sm:w-auto font-bold rounded-xl h-11 px-8">
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Créer l'événement
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
