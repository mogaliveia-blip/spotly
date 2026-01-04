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
import { useState, useEffect } from 'react';
import { 
  signInWithEmailAndPassword, 
  GoogleAuthProvider, 
  signInWithRedirect,
  getRedirectResult,
  getAdditionalUserInfo,
  sendSignInLinkToEmail,
  isSignInWithEmailLink,
  signInWithEmailLink
} from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useRouter, useSearchParams } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import { AuthFormWrapper } from './auth-form-wrapper';
import { Loader2 } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { createUserInFirestore } from '@/lib/data';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const passwordSchema = z.object({
  email: z.string().email({ message: 'Veuillez saisir une adresse e-mail valide.' }),
  password: z.string().min(1, { message: 'Le mot de passe est requis.' }),
});

const emailLinkSchema = z.object({
  email: z.string().email({ message: 'Veuillez saisir une adresse e-mail valide.' }),
});

const GoogleIcon = (props: React.SVGProps<SVGSVGElement>) => (
    <svg
      role="img"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <title>Google</title>
      <path d="M12.48 10.92v3.28h7.84c-.24 1.84-.85 3.18-1.73 4.1-1.02 1.02-2.6 1.98-4.66 1.98-3.56 0-6.47-2.91-6.47-6.47s2.91-6.47 6.47-6.47c1.98 0 3.33.74 4.3 1.69l2.5-2.5C18.16 3.79 15.48 2.5 12.48 2.5c-5.47 0-9.92 4.45-9.92 9.92s4.45 9.92 9.92 9.92c5.05 0 9.32-3.64 9.32-9.56 0-.64-.06-1.25-.16-1.84H12.48z" />
    </svg>
  );

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [formLoading, setFormLoading] = useState(false);
  const [linkSent, setLinkSent] = useState(false);

  const passwordForm = useForm<z.infer<typeof passwordSchema>>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { email: '', password: '' },
  });

  const emailLinkForm = useForm<z.infer<typeof emailLinkSchema>>({
    resolver: zodResolver(emailLinkSchema),
    defaultValues: { email: '' },
  });
  
  useEffect(() => {
    const handleLoginRedirect = async () => {
      try {
        let isRedirecting = false;
        
        // Handle Email Link Sign-in
        if (isSignInWithEmailLink(auth, window.location.href)) {
          isRedirecting = true;
          setLoading(true);
          let email = window.localStorage.getItem('emailForSignIn');
          if (!email) {
            email = window.prompt('Veuillez fournir votre e-mail pour confirmation');
          }
          if (email) {
            const result = await signInWithEmailLink(auth, email, window.location.href);
            window.localStorage.removeItem('emailForSignIn');
            if (getAdditionalUserInfo(result)?.isNewUser) {
              await createUserInFirestore({
                uid: result.user.uid,
                email: result.user.email,
                displayName: result.user.displayName,
                photoURL: result.user.photoURL,
                role: 'user',
              });
            }
            router.replace(searchParams.get('redirect') || '/dashboard');
            return;
          } else {
             setLoading(false);
          }
        }

        // Handle Google Sign-in
        const result = await getRedirectResult(auth);
        if (result) {
          isRedirecting = true;
          setLoading(true);
          if (getAdditionalUserInfo(result)?.isNewUser) {
            await createUserInFirestore({
              uid: result.user.uid,
              email: result.user.email,
              displayName: result.user.displayName,
              photoURL: result.user.photoURL,
              role: 'user',
            });
            toast({ title: 'Compte créé !', description: 'Bienvenue dans Eventide Guide.' });
          }
          router.replace(searchParams.get('redirect') || '/dashboard');
          return;
        }
        
        if (!isRedirecting) {
          setLoading(false);
        }

      } catch (error: any) {
        toast({
          title: 'Échec de la connexion',
          description: error.message || 'Une erreur est survenue lors de la tentative de connexion.',
          variant: 'destructive',
        });
        setLoading(false);
      }
    };

    handleLoginRedirect();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


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

  async function onEmailLinkSubmit(values: z.infer<typeof emailLinkSchema>) {
    setFormLoading(true);
    const actionCodeSettings = {
      url: window.location.href, // Use the current URL
      handleCodeInApp: true,
    };
    try {
      await sendSignInLinkToEmail(auth, values.email, actionCodeSettings);
      window.localStorage.setItem('emailForSignIn', values.email);
      setLinkSent(true);
      toast({
        title: 'Vérifiez vos e-mails',
        description: `Un lien de connexion a été envoyé à ${values.email}.`,
      });
    } catch (error: any) {
        console.error('Erreur du lien de messagerie :', error);
      toast({
        title: 'Impossible d\'envoyer le lien',
        description: 'Une erreur inattendue est survenue. Veuillez réessayer.',
        variant: 'destructive',
      });
    } finally {
      setFormLoading(false);
    }
  }
  
  async function handleGoogleSignIn() {
    setLoading(true); // Show loader while redirecting
    const provider = new GoogleAuthProvider();
    await signInWithRedirect(auth, provider);
  }

  return (
    <AuthFormWrapper
      title="Content de vous revoir"
      description="Connectez-vous à votre compte Eventide Guide"
      footerText="Vous n'avez pas de compte ?"
      footerLink="/signup"
      footerLinkText="Inscrivez-vous"
    >
      {loading ? (
        <div className="flex justify-center items-center p-8">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
        </div>
      ) : (
      <>
      <Tabs defaultValue="password">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="password">Mot de passe</TabsTrigger>
          <TabsTrigger value="email-link">Lien par e-mail</TabsTrigger>
        </TabsList>
        <TabsContent value="password">
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
        </TabsContent>
        <TabsContent value="email-link">
            {linkSent ? (
                 <div className="text-center py-8">
                    <h3 className="text-xl font-semibold">Vérifiez votre boîte de réception</h3>
                    <p className="text-muted-foreground mt-2">Un lien de connexion a été envoyé à l'adresse e-mail que vous fournie.</p>
                 </div>
            ) : (
                <Form {...emailLinkForm}>
                    <form onSubmit={emailLinkForm.handleSubmit(onEmailLinkSubmit)} className="space-y-6 pt-4">
                    <FormField
                        control={emailLinkForm.control}
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
                    <Button type="submit" className="w-full" disabled={formLoading}>
                        {formLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Envoyer le lien de connexion
                    </Button>
                    </form>
                </Form>
            )}
        </TabsContent>
      </Tabs>
      
      <div className="relative my-4">
        <Separator />
        <p className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-card px-2 text-xs text-muted-foreground">
          OU CONTINUER AVEC
        </p>
      </div>

      <Button variant="outline" className="w-full" onClick={handleGoogleSignIn} disabled={formLoading}>
        <GoogleIcon className="mr-2 h-4 w-4" />
        Se connecter avec Google
      </Button>
      </>
      )}
    </AuthFormWrapper>
  );
}
