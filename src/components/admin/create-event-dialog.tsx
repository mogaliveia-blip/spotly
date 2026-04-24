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
});

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
    defaultValues: { name: '', slug: '' },
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
        ...values,
        ownerId: user.uid,
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

  // ✅ Blocage UI du trigger
  if (!isApproved) {
    return (
        <Button disabled className="gap-2 rounded-2xl font-bold opacity-60">
            <Lock className="h-4 w-4" />
            Créer un événement (Compte non validé)
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
      <DialogContent className="sm:max-w-[425px] rounded-[2rem]">
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
