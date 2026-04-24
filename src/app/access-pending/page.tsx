'use client';

import { useAuth } from '@/hooks/use-auth-user';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Clock, LogOut, Mountain, RefreshCw } from 'lucide-react';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function AccessPendingPage() {
    const { user, isApproved, loading } = useAuth();
    const router = useRouter();

    useEffect(() => {
        // Redirection si l'utilisateur est soudainement approuvé
        if (!loading && user && isApproved) {
            router.replace('/admin/events');
        }
    }, [user, isApproved, loading, router]);

    const handleSignOut = async () => {
        await signOut(auth);
        router.push('/');
        router.refresh();
    };

    const handleRefresh = () => {
        window.location.reload();
    };

    if (loading) {
        return (
            <div className="flex h-screen w-full items-center justify-center bg-background">
                <Mountain className="h-12 w-12 animate-pulse text-primary" />
            </div>
        );
    }

    return (
        <div className="flex min-h-screen items-center justify-center bg-background p-4">
            <Card className="w-full max-w-md border-muted shadow-2xl rounded-[2rem] overflow-hidden">
                <CardHeader className="text-center bg-primary/5 pb-8">
                    <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 mb-4">
                        <Clock className="h-8 w-8 text-primary animate-pulse" />
                    </div>
                    <CardTitle className="text-2xl font-bold">Compte en attente</CardTitle>
                    <CardDescription className="text-base mt-2">
                        Salut <span className="font-bold text-foreground">{user?.displayName}</span> !
                        Votre compte est en cours de validation par nos équipes.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6 pt-8">
                    <div className="bg-muted/30 p-4 rounded-2xl border border-dashed border-muted-foreground/20 text-sm text-muted-foreground text-center">
                        Dès que votre accès sera validé, vous pourrez créer vos événements et gérer vos points d'intérêt.
                    </div>

                    <div className="grid gap-3">
                        <Button onClick={handleRefresh} className="w-full rounded-xl font-bold h-11 shadow-sm">
                            <RefreshCw className="mr-2 h-4 w-4" />
                            Vérifier mon statut
                        </Button>
                        <Button onClick={handleSignOut} variant="outline" className="w-full rounded-xl h-11">
                            <LogOut className="mr-2 h-4 w-4" />
                            Se déconnecter
                        </Button>
                    </div>
                    
                    <p className="text-center text-xs text-muted-foreground">
                        Besoin d'aide ? Contactez l'administrateur de la plateforme.
                    </p>
                </CardContent>
            </Card>
        </div>
    );
}
