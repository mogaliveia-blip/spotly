import { AppLayout } from "@/components/layout/app-layout";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // The dashboard variant is no longer needed, as the layout is handled by the page itself
  return <AppLayout>{children}</AppLayout>;
}
