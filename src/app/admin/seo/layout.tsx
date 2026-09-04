import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Centre de contrôle SEO | Un Instant Ici',
  robots: {
    index: false,
    follow: false,
  },
}

export default function SeoAdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
