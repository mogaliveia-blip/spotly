'use client';

import { useState } from 'react';
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
import { createEvent } from '@/lib/data';
import { useAuth } from '@/hooks/use-auth-user';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import { Loader2, PlusCircle, Lock } from 'lucide-react';

const formSchema = z.object({
  name: z.string().min(3, 'Le nom doit faire au moins 3 caractères'),
  slug: z.string().min(3, 'Le slug doit faire au moins 3 caractères').regex(/^[a-z0-9-]+$/, 'Slug invalide (minuscules, chiffres et tirets uniquement)'),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  timezone: z.string().min(1, 'Fuseau horaire requis'),
  city: z.string().max(80, 'Ville trop longue').optional(),
  departmentName: z.string().max(80, 'Département trop long').optional(),
  region: z.string().max(80, 'Région trop longue').optional(),
  country: z.string().max(80, 'Pays trop long').optional(),
}).refine((data) => {
  if (!data.startDate || !data.endDate) return true;
  return data.startDate <= data.endDate;
}, { message: 'La date de fin doit être postérieure à la date de début', path: ['endDate'] });

function parseDateInput(value?: string): Date | undefined {
  if (!value) return undefined;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

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
  const { user, isApproved } = useAuth();
  const router = useRouter();
  const { toast } = useToast();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      slug: '',
      startDate: '',
      endDate: '',
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
    const slug = val
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    form.setValue('slug', slug, { shouldValidate: true });
  };

  async function onSubmit(values: z.infer<typeof formSchema>) {
    if (!user || !isApproved) return;
    setLoading(true);
    try {
      const event = await createEvent({
        name: values.name,
        slug: values.slug,
        adminId: user.uid,
        startDate: parseDateInput(values.startDate),
        endDate: parseDateInput(values.endDate),
        timezone: values.timezone,
        city: optionalText(values.city),
        departmentName: optionalText(values.departmentName),
        region: optionalText(values.region),
        country: optionalText(values.country),
      });
      toast({ title: 'Événement créé !', description: `L'événement ${event.name} est prêt.` });
      setOpen(false);
      if (onEventCreated) onEventCreated();
      router.push(`/admin/events`);
    } catch (error) {
      toast({ title: 'Erreur', description: 'Impossible de créer l\'événement.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }

  if (!isApproved) {
    return (
        <Button disabled className="gap-2 rounded-2xl font-bold opacity-60">
            <Lock className="h-4 w-4" />
            Créer un événement
        </Button>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2 rounded-2xl font-bold shadow-sm">
          <PlusCircle className="h-4 w-4" />
          Créer un événement
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[640px] rounded-[2rem]">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold">Nouvel Événement</DialogTitle>
          <DialogDescription>
            Créez un espace dédié pour votre festival ou rassemblement.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-4">
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
                name="startDate"
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
                name="endDate"
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
            <div className="flex justify-end pt-4">
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
