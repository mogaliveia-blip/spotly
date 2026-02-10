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
import { createUserWithEmailAndPassword, updateProfile, sendEmailVerification } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import { createUserInFirestore } from '@/lib/data';
import {
  CardContent,
  CardFooter,
} from '@/components/ui/card';

const formSchema = z.object({
  displayName: z.string().min(2, { message: 'Le prénom doit comporter au moins 2 caractères.' }),
  email: z.string().email({ message: 'Veuillez saisir une adresse e-mail valide.' }),
  password: z.string().min(6, { message: 'Le mot de passe doit comporter au moins 6 caractères.' }),
});

interface SignupFormProps {
  onSuccess?: () => void;
  onSwitchToLogin?: () => void;
}

export function SignupForm({ onSuccess, onSwitchToLogin }: SignupFormProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      displayName: '',
      email: '',
      password: '',
    },
  });

  async function onSubmit(values: z.infer<typeof formSchema>) {
    setLoading(true);
    try {
      // 1️⃣ Création du compte Auth
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        values.email,
        values.password
      );

      // 2️⃣ Mise à jour du profil Auth
      await updateProfile(userCredential.user, {
        displayName: values.displayName,
      });

      // 3️⃣ Envoi de l'email de vérification
      await sendEmailVerification(userCredential.user);

      // 4️⃣ Création du document Firestore
      await createUserInFirestore({
        uid: userCredential.user.uid,
        email: userCredential.user.email!,
        displayName: values.displayName,
        role: 'user', // ✅ rôle par défaut, TOUJOURS
      });

      toast({
        title: 'Compte créé !',
        description: 'Un e-mail de vérification a été envoyé. Consultez votre boîte de réception pour continuer.',
      });

      onSuccess?.();
    } catch (error: any) {
      toast({
        title: "Échec de l'inscription",
        description:
          error.code === 'auth/email-already-in-use'
            ? 'Cet e-mail est déjà associé à un compte.'
            : 'Une erreur inattendue est survenue.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <CardContent className="p-6 pt-0">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="displayName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Prénom</FormLabel>
                  <FormControl>
                    <Input {...field} disabled={loading} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>E-mail</FormLabel>
                  <FormControl>
                    <Input type="email" {...field} disabled={loading} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Mot de passe</FormLabel>
                  <FormControl>
                    <Input type="password" {...field} disabled={loading} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit" className="w-full" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Créer un compte
            </Button>
          </form>
        </Form>
      </CardContent>
      <CardFooter className="p-6 pt-0 text-center text-sm">
        Déjà un compte ?{' '}
        <Button variant="link" className="p-0 h-auto" onClick={onSwitchToLogin}>
          Se connecter
        </Button>
      </CardFooter>
    </>
  );
}
