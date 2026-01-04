'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useState } from 'react';
import { 
  signInWithEmailAndPassword
} from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useRouter, useSearchParams } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import { AuthFormWrapper } from './auth-form-wrapper';
import { Loader2 } from 'lucide-react';

const passwordSchema = z.object({
  email: z.string().email({ message: 'Veuillez saisir une adresse e-mail valide.' }),
  password: z.string().min(1, { message: 'Le mot de passe est requis.' }),
});

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const [formLoading, setFormLoading] = useState(false);

  const passwordForm = useForm<z.infer<typeof passwordSchema>>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { email: '', password: '' },
  });

  async function onPasswordSubmit(values: z.infer<typeof passwordSchema>) {
    setFormLoading(true);
    try {
      await signInWithEmailAndPassword(auth, values.email, values.password);
      router.push(searchParams.get('redirect') || '/dashboard');
    } catch (error: any) {
      toast({
        title: 'Échec de la connexion',
        description:
          error.code === 'auth/invalid-credential'
            ? 'E-mail ou mot de passe invalide.'
            : 'Une erreur inattendue est survenue.',
        variant: 'destructive',
      });
    } finally {
      setFormLoading(false);
    }
  }

  return (
    <AuthFormWrapper
      title="Content de vous revoir"
      description="Connectez-vous à votre compte Eventide Guide"
      footerText="Vous n'avez pas de compte ?"
      footerLink="/signup"
      footerLinkText="Inscrivez-vous"
    >
      <Form {...passwordForm}>
        <form onSubmit={passwordForm.handleSubmit(onPasswordSubmit)} className="space-y-6 pt-4">
          <div className="space-y-4">
            <FormField
              control={passwordForm.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>E-mail</FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      placeholder="nom@example.com"
                      {...field}
                      disabled={formLoading}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={passwordForm.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Mot de passe</FormLabel>
                  <FormControl>
                    <Input type="password" placeholder="••••••••" {...field} disabled={formLoading} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          <Button type="submit" className="w-full" disabled={formLoading}>
            {formLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Se connecter
          </Button>
        </form>
      </Form>
    </AuthFormWrapper>
  );
}
