'use client';

import { useState } from 'react';
import { useAuth } from '@/hooks/use-auth-user';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { MailCheck, LogOut, Loader2 } from 'lucide-react';
import { signOut, sendEmailVerification } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';


export function VerifyEmailPage() {
    const { firebaseUser } = useAuth();
    const { toast } = useToast();
    const router = useRouter();
    const [loadingResend, setLoadingResend] = useState(false);

    const handleSignOut = async () => {
        await signOut(auth);
        router.push('/');
        router.refresh();
    };

    const handleResendEmail = async () => {
        if (!firebaseUser) return;
        setLoadingResend(true);
        try {
            await sendEmailVerification(firebaseUser);
            toast({
                title: 'E-mail renvoyé !',
                description: 'Veuillez consulter votre boîte de réception.',
            });
        } catch (error) {
            toast({
                title: 'Erreur',
                description: "Impossible de renvoyer l'e-mail. Veuillez réessayer plus tard.",
                variant: 'destructive',
            });
        } finally {
            setLoadingResend(false);
        }
    };
    
    return (
        <div className="flex min-h-screen items-center justify-center bg-background p-4">
            <Card className="w-full max-w-md">
                <CardHeader className="text-center">
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                        <MailCheck className="h-6 w-6 text-primary" />
                    </div>
                    <CardTitle className="mt-4 text-2xl">Vérifiez votre adresse e-mail</CardTitle>
                    <CardDescription>
                        Nous avons envoyé un lien de vérification à{' '}
                        <span className="font-semibold text-foreground">{firebaseUser?.email}</span>.
                        Veuillez cliquer sur ce lien pour activer votre compte.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <Button onClick={handleResendEmail} className="w-full" disabled={loadingResend}>
                        {loadingResend ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                             "Renvoyer l'e-mail de validation"
                        )}
                    </Button>
                    <Button onClick={handleSignOut} variant="outline" className="w-full">
                        <LogOut className="mr-2 h-4 w-4" />
                        Se déconnecter
                    </Button>
                    <p className="text-center text-xs text-muted-foreground pt-2">
                        Si vous ne trouvez pas l'e-mail, vérifiez votre dossier de courrier indésirable.
                    </p>
                </CardContent>
            </Card>
        </div>
    );
}
