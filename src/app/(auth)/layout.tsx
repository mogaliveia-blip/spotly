// src/app/(auth)/layout.tsx
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // This layout is simplified as the auth forms are now primarily shown in modals.
  return <>{children}</>;
}
