import { AppShell } from '@/components/shell/app-shell'
import { requireLayoutRole } from '@/lib/security/guards'

export default async function PatientLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await requireLayoutRole(['Patient', 'Admin'])

  return (
    <AppShell
      role="Patient"
      user={{
        name: session.profileName,
        email: session.user.email ?? '',
      }}
    >
      {children}
    </AppShell>
  )
}