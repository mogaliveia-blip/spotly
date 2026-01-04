// This page can be used as a fallback for direct navigation to /login,
// but the primary login flow will now be through a modal.
// We'll redirect to the dashboard, which handles showing the map.
// The login button in the header will open the modal.

import { redirect } from 'next/navigation';

export default function LoginPage() {
  redirect('/dashboard');
}
