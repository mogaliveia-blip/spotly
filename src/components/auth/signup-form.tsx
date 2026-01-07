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
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { auth, db } from '@/lib/firebase';
import { useRouter } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import { createUserInFirestore } from '@/lib/data';
import {
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@/components/ui/card';
import { Mountain } from 'lucide-react';
import { collection, getCount } from 'firebase/firestore';

const formSchema = z.object({
  displayName: z.string().min(2, { message: 'Le nom doit comporter au moins 2 caractères.' }),
  email: z.string().email({ message: 'Veuillez saisir une adresse e-mail valide.' }),
  password: z.string().min(6, { message: 'Le mot de passe doit comporter au moins 6 caractères.' }),
});

interface SignupFormProps {
  onSuccess?: () => void;
  onSwitchToLogin?: () => void;
}

export function SignupForm({ onSuccess, onSwitchToLogin }: SignupFormProps) {
  const router = useRouter();
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
      // Vérifier s'il s'agit du premier utilisateur
      const usersCollectionRef = collection(db, 'users');
      const countSnapshot = await getCount(usersCollectionRef);
      const isFirstUser = countSnapshot.data().count === 0;
      const roleToAssign = isFirstUser ? 'admin' : 'user';

      const userCredential = await createUserWithEmailAndPassword(
        auth,
        values.email,
        values.password
      );
      
      await updateProfile(userCredential.user, {
        displayName: values.displayName,
      });

      // Créer un document utilisateur correspondant dans Firestore avec le rôle approprié
      await createUserInFirestore({
        uid: userCredential.user.uid,
        email: userCredential.user.email,
        displayName: values.displayName,
        role: roleToAssign,
      });
      
      toast({
        title: 'Compte créé !',
        description: isFirstUser 
            ? 'Bienvenue ! Votre compte administrateur a été créé.'
            : 'Bienvenue dans Eventide Guide.',
      });
      router.refresh();
      onSuccess?.();
    } catch (error: any) {
      toast({
        title: 'Échec de l\'inscription',
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
                  <FormLabel>Nom</FormLabel>
                  <FormControl>
                    <Input placeholder="Votre nom" {...field} disabled={loading} />
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
                    <Input
                      type="email"
                      placeholder="nom@example.com"
                      {...field}
                      disabled={loading}
                    />
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
                    <Input type="password" placeholder="••••••••" {...field} disabled={loading} />
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
      <CardFooter className="p-6 pt-0">
        <div className="mt-4 text-center text-sm w-full">
          Vous avez déjà un compte ?{' '}
          <Button variant="link" className="p-0 h-auto" onClick={onSwitchToLogin}>
            Se connecter
          </Button>
        </div>
      </CardFooter>
    </>
  );
}
