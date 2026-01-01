'use client';
import { useEffect } from 'react';
import { errorEmitter } from '@/firebase/error-emitter';

export default function FirebaseErrorListener() {
  useEffect(() => {
    const handlePermissionError = (error: Error) => {
      // This will be caught by the Next.js development overlay
      throw error;
    };

    errorEmitter.on('permission-error', handlePermissionError);

    return () => {
      errorEmitter.off('permission-error', handlePermissionError);
    };
  }, []);

  return null; // This component does not render anything
}
