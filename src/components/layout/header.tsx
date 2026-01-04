'use client';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { UserNav } from './user-nav';
import { Mountain } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth-user';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogTrigger,
} from '@/components/ui/dialog';
import { LoginForm } from '../auth/login-form';
import { SignupForm } from '../auth/signup-form';
import { useState } from 'react';
import { Card } from '../ui/card';

function AuthDialog() {
  const [open, setOpen] = useState(false);
  const [isLoginView, setIsLoginView] = useState(true);

  const handleSuccess = () => {
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>Se connecter</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md p-0">
        <Card className="w-full border-0">
          {isLoginView ? (
            <LoginForm 
              onSuccess={handleSuccess} 
              onSwitchToSignup={() => setIsLoginView(false)}
            />
          ) : (
            <SignupForm 
              onSuccess={handleSuccess}
              onSwitchToLogin={() => setIsLoginView(true)}
            />
          )}
        </Card>
      </DialogContent>
    </Dialog>
  );
}


export function Header() {
  const { user } = useAuth();
  return (
    <header className="sticky top-0 z-10 flex h-16 items-center gap-4 border-b bg-background px-4 md:px-6">
      <div className="flex items-center gap-2">
        <SidebarTrigger className="md:hidden" />
        <Mountain className="h-6 w-6 text-primary" />
        <h1 className="text-lg font-semibold tracking-tight">Eventide Guide</h1>
      </div>
      <div className="ml-auto flex items-center gap-4">
        {user ? (
          <UserNav />
        ) : (
          <AuthDialog />
        )}
      </div>
    </header>
  );
}
