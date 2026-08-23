import { AppShell } from '@/components/shell/app-shell'
import { requireLayoutRole } from '@/lib/security/guards'

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await requireLayoutRole('Admin')

  return (
    <AppShell
      role="Admin"
      user={{
        name: session.profileName,
        email: session.user.email ?? '',
      }}
    >
      {children}
    </AppShell>
  )
}