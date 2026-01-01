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
  signInWithPopup, 
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
  email: z.string().email({ message: 'Please enter a valid email address.' }),
  password: z.string().min(1, { message: 'Password is required.' }),
});

const emailLinkSchema = z.object({
  email: z.string().email({ message: 'Please enter a valid email address.' }),
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
  const [loading, setLoading] = useState(false);
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
    const handleEmailLinkSignIn = async () => {
      if (isSignInWithEmailLink(auth, window.location.href)) {
        setLoading(true);
        let email = window.localStorage.getItem('emailForSignIn');
        if (!email) {
          // This can happen if the user opens the link on a different device.
          // We can prompt them for their email.
          email = window.prompt('Please provide your email for confirmation');
        }
        if (email) {
          try {
            const result = await signInWithEmailLink(auth, email, window.location.href);
            window.localStorage.removeItem('emailForSignIn');
            const additionalInfo = getAdditionalUserInfo(result);
            if (additionalInfo?.isNewUser) {
              await createUserInFirestore({
                uid: result.user.uid,
                email: result.user.email,
                displayName: result.user.displayName,
                role: 'user',
                photoURL: result.user.photoURL,
              });
            }
            router.push(searchParams.get('redirect') || '/dashboard');
          } catch (error) {
            toast({
              title: 'Sign In Failed',
              description: 'The sign-in link is invalid or has expired. Please try again.',
              variant: 'destructive',
            });
          } finally {
            setLoading(false);
          }
        } else {
            setLoading(false);
        }
      }
    };
    handleEmailLinkSignIn();
  }, [router, toast, searchParams]);


  async function onPasswordSubmit(values: z.infer<typeof passwordSchema>) {
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, values.email, values.password);
      router.push(searchParams.get('redirect') || '/dashboard');
    } catch (error: any) {
      toast({
        title: 'Login Failed',
        description:
          error.code === 'auth/invalid-credential'
            ? 'Invalid email or password.'
            : 'An unexpected error occurred.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }

  async function onEmailLinkSubmit(values: z.infer<typeof emailLinkSchema>) {
    setLoading(true);
    const actionCodeSettings = {
      url: window.location.href, // Redirect back to the login page
      handleCodeInApp: true,
    };
    try {
      await sendSignInLinkToEmail(auth, values.email, actionCodeSettings);
      window.localStorage.setItem('emailForSignIn', values.email);
      setLinkSent(true);
      toast({
        title: 'Check your email',
        description: `A sign-in link has been sent to ${values.email}.`,
      });
    } catch (error: any) {
        console.error('Email Link Error:', error);
      toast({
        title: 'Could not send link',
        description: 'An unexpected error occurred. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }
  
  async function handleGoogleSignIn() {
    setLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const additionalInfo = getAdditionalUserInfo(result);
      
      if (additionalInfo?.isNewUser) {
        await createUserInFirestore({
          uid: result.user.uid,
          email: result.user.email,
          displayName: result.user.displayName,
          role: 'user', 
          photoURL: result.user.photoURL,
        });
        toast({
          title: 'Account Created!',
          description: 'Welcome to Eventide Guide.',
        });
      }

      router.push(searchParams.get('redirect') || '/dashboard');
    } catch (error: any) {
        console.error(error);
        toast({
            title: 'Google Sign-In Failed',
            description: 'Could not sign in with Google. Please try again.',
            variant: 'destructive',
        });
    } finally {
        setLoading(false);
    }
  }

  const handleDemoLogin = async (email: string) => {
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, "password");
      router.push('/dashboard');
    } catch (error) {
      toast({
        title: 'Demo Login Failed',
        description: `Could not log in as ${email}. Ensure demo accounts are set up in your Firebase project with the password 'password'.`,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthFormWrapper
      title="Welcome Back"
      description="Sign in to your Eventide Guide account"
      footerText="Don't have an account?"
      footerLink="/signup"
      footerLinkText="Sign up"
    >
      <Tabs defaultValue="password">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="password">Password</TabsTrigger>
          <TabsTrigger value="email-link">Email Link</TabsTrigger>
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
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input
                          type="email"
                          placeholder="name@example.com"
                          {...field}
                          disabled={loading}
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
                      <FormLabel>Password</FormLabel>
                      <FormControl>
                        <Input type="password" placeholder="••••••••" {...field} disabled={loading} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Sign In
              </Button>
            </form>
          </Form>
        </TabsContent>
        <TabsContent value="email-link">
            {linkSent ? (
                 <div className="text-center py-8">
                    <h3 className="text-xl font-semibold">Check your inbox</h3>
                    <p className="text-muted-foreground mt-2">A sign-in link has been sent to the email address you provided.</p>
                 </div>
            ) : (
                <Form {...emailLinkForm}>
                    <form onSubmit={emailLinkForm.handleSubmit(onEmailLinkSubmit)} className="space-y-6 pt-4">
                    <FormField
                        control={emailLinkForm.control}
                        name="email"
                        render={({ field }) => (
                        <FormItem>
                            <FormLabel>Email</FormLabel>
                            <FormControl>
                            <Input
                                type="email"
                                placeholder="name@example.com"
                                {...field}
                                disabled={loading}
                            />
                            </FormControl>
                            <FormMessage />
                        </FormItem>
                        )}
                    />
                    <Button type="submit" className="w-full" disabled={loading}>
                        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Send Sign-In Link
                    </Button>
                    </form>
                </Form>
            )}
        </TabsContent>
      </Tabs>
      
      <div className="relative my-4">
        <Separator />
        <p className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-card px-2 text-xs text-muted-foreground">
          OR CONTINUE WITH
        </p>
      </div>

      <Button variant="outline" className="w-full" onClick={handleGoogleSignIn} disabled={loading}>
        {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <GoogleIcon className="mr-2 h-4 w-4" />}
        Sign in with Google
      </Button>

      <div className="mt-4 space-y-2">
        <p className="text-center text-sm text-muted-foreground">For demo purposes:</p>
        <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={() => handleDemoLogin('editor@test.com')} disabled={loading}>Login as Editor</Button>
            <Button variant="outline" onClick={() => handleDemoLogin('admin@test.com')} disabled={loading}>Login as Admin</Button>
        </div>
      </div>
    </AuthFormWrapper>
  );
}
