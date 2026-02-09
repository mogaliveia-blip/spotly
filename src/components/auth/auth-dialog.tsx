// src/components/auth/auth-dialog.tsx
'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Card } from '@/components/ui/card';
import { LoginForm } from './login-form';
import { SignupForm } from './signup-form';
import { Mountain } from 'lucide-react';

interface AuthDialogProps {
  trigger: React.ReactNode;
  initialView?: 'login' | 'signup';
}

export function AuthDialog({ trigger, initialView = 'login' }: AuthDialogProps) {
  const [open, setOpen] = useState(false);
  const [isLoginView, setIsLoginView] = useState(initialView === 'login');

  const handleSuccess = () => {
    setOpen(false);
  };
  
  // Reset view when dialog is opened/closed
  const onOpenChange = (isOpen: boolean) => {
    setOpen(isOpen);
    if (isOpen) {
      setIsLoginView(initialView === 'login');
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        {trigger}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md p-0">
         <DialogHeader className="text-center p-6 pb-0">
            <div className="mb-4 flex justify-center">
                <Mountain className="h-10 w-10 text-primary" />
            </div>
            <DialogTitle className="text-2xl">
                {isLoginView ? 'Content de vous revoir' : 'Créer un compte'}
            </DialogTitle>
            <DialogDescription>
                {isLoginView ? 'Connectez-vous à votre compte Leu Tempo' : 'Rejoignez Leu Tempo pour explorer des événements'}
            </DialogDescription>
        </DialogHeader>
        <Card className="w-full border-0 shadow-none">
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
