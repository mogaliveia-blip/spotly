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
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import {
  CardContent,
  CardFooter,
} from '@/components/ui/card';

const passwordSchema = z.object({
  email: z.string().email({ message: 'Veuillez saisir une adresse e-mail valide.' }),
  password: z.string().min(1, { message: 'Le mot de passe est requis.' }),
});

interface LoginFormProps {
  onSuccess?: () => void;
  onSwitchToSignup?: () => void;
  onSwitchToPasswordReset?: () => void;
}

export function LoginForm({ onSuccess, onSwitchToSignup, onSwitchToPasswordReset }: LoginFormProps) {
  const router = useRouter();
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
      toast({
        title: 'Connexion réussie !',
        description: 'Content de vous revoir.',
      });
      router.refresh(); // Refresh server components to get new user state
      onSuccess?.(); // Close modal on success
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
    <>
      <CardContent className="p-6 pt-0">
        <Form {...passwordForm}>
          <form onSubmit={passwordForm.handleSubmit(onPasswordSubmit)} className="space-y-6">
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
                    <div className="flex items-center justify-between">
                      <FormLabel>Mot de passe</FormLabel>
                      {onSwitchToPasswordReset && (
                        <Button
                          type="button"
                          variant="link"
                          className="p-0 h-auto text-xs"
                          onClick={onSwitchToPasswordReset}
                        >
                          Mot de passe oublié ?
                        </Button>
                      )}
                    </div>
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
      </CardContent>
      {onSwitchToSignup && (
        <CardFooter className="flex-col items-stretch p-6 border-t gap-2">
          <div className="text-sm text-center text-muted-foreground">
            Vous n'avez pas de compte ?
          </div>
          <Button variant="outline" className="w-full" onClick={onSwitchToSignup}>
            Créer un compte
          </Button>
        </CardFooter>
      )}
    </>
  );
}
