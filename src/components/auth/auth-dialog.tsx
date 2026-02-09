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
import { PasswordResetForm } from './password-reset-form';
import { Mountain } from 'lucide-react';

type AuthView = 'login' | 'signup' | 'passwordReset';

interface AuthDialogProps {
  trigger: React.ReactNode;
  initialView?: AuthView;
}

export function AuthDialog({ trigger, initialView = 'login' }: AuthDialogProps) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<AuthView>(initialView);

  const handleSuccess = () => {
    setOpen(false);
  };
  
  // Reset view when dialog is opened/closed
  const onOpenChange = (isOpen: boolean) => {
    setOpen(isOpen);
    if (isOpen) {
      setView(initialView);
    }
  }

  const getTitle = () => {
    switch (view) {
      case 'signup':
        return 'Créer un compte';
      case 'passwordReset':
        return 'Réinitialiser le mot de passe';
      case 'login':
      default:
        return 'Content de vous revoir';
    }
  };

  const getDescription = () => {
    switch (view) {
      case 'signup':
        return 'Rejoignez Leu Tempo pour explorer des événements';
      case 'passwordReset':
        return 'Entrez votre e-mail pour recevoir un lien de réinitialisation.';
      case 'login':
      default:
        return 'Connectez-vous à votre compte Leu Tempo';
    }
  };

  const renderContent = () => {
    switch (view) {
      case 'signup':
        return (
          <SignupForm 
            onSuccess={handleSuccess}
            onSwitchToLogin={() => setView('login')}
          />
        );
      case 'passwordReset':
        return (
          <PasswordResetForm 
            onSwitchToLogin={() => setView('login')}
          />
        );
      case 'login':
      default:
        return (
          <LoginForm 
            onSuccess={handleSuccess} 
            onSwitchToSignup={() => setView('signup')}
            onSwitchToPasswordReset={() => setView('passwordReset')}
          />
        );
    }
  };

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
                {getTitle()}
            </DialogTitle>
            <DialogDescription>
                {getDescription()}
            </DialogDescription>
        </DialogHeader>
        <Card className="w-full border-0 shadow-none">
          {renderContent()}
        </Card>
      </DialogContent>
    </Dialog>
  );
}
