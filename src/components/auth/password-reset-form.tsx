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
import { sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import {
  CardContent,
  CardFooter,
} from '@/components/ui/card';

const formSchema = z.object({
  email: z.string().email({ message: 'Veuillez saisir une adresse e-mail valide.' }),
});

interface PasswordResetFormProps {
  onSwitchToLogin?: () => void;
}

export function PasswordResetForm({ onSwitchToLogin }: PasswordResetFormProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: '',
    },
  });

  async function onSubmit(values: z.infer<typeof formSchema>) {
    setLoading(true);
    try {
      await sendPasswordResetEmail(auth, values.email);
      setEmailSent(true);
    } catch (error: any) {
      // Don't reveal if the user exists or not for security reasons.
      // We'll show the success message regardless.
      console.error("Password reset error:", error);
      setEmailSent(true); // Show success UI even on error to prevent user enumeration
    } finally {
      setLoading(false);
    }
  }

  if (emailSent) {
    return (
        <div className="p-6 text-center">
            <h3 className="text-lg font-semibold">Vérifiez vos e-mails</h3>
            <p className="mt-2 text-sm text-muted-foreground">
                Si un compte existe pour **{form.getValues('email')}**, vous recevrez un e-mail avec un lien pour réinitialiser votre mot de passe.
            </p>
            <Button variant="link" className="mt-4" onClick={onSwitchToLogin}>
                Retour à la connexion
            </Button>
        </div>
    );
  }

  return (
    <>
      <CardContent className="p-6 pt-0">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
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
            <Button type="submit" className="w-full" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Envoyer l'e-mail de réinitialisation
            </Button>
          </form>
        </Form>
      </CardContent>
      <CardFooter className="p-4 border-t bg-muted/50">
        <div className="text-center text-sm w-full">
            <Button variant="link" className="p-0 h-auto" onClick={onSwitchToLogin}>
                Retour à la connexion
            </Button>
        </div>
      </CardFooter>
    </>
  );
}
