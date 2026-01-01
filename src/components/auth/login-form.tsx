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
import { signInWithEmailAndPassword, GoogleAuthProvider, signInWithPopup, getAdditionalUserInfo } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useRouter, useSearchParams } from 'next/navigation';
import { useToast } from '@/hooks/use-toast';
import { AuthFormWrapper } from './auth-form-wrapper';
import { Loader2 } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { createUserInFirestore } from '@/lib/data';

const formSchema = z.object({
  email: z.string().email({ message: 'Please enter a valid email address.' }),
  password: z.string().min(1, { message: 'Password is required.' }),
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

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  async function onSubmit(values: z.infer<typeof formSchema>) {
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
  
  async function handleGoogleSignIn() {
    setLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const additionalInfo = getAdditionalUserInfo(result);
      
      if (additionalInfo?.isNewUser) {
        // If it's a new user, create a document in Firestore
        await createUserInFirestore({
          uid: result.user.uid,
          email: result.user.email,
          displayName: result.user.displayName,
          role: 'user', // Default role for new users
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


  // Demo accounts
  const handleDemoLogin = async (email: string) => {
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, "password");
      router.push('/dashboard');
    } catch (error) {
      // In a real app, you might auto-create these demo accounts
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
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <div className="space-y-4">
            <FormField
              control={form.control}
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
              control={form.control}
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
