import { AppShell } from '@/components/shell/app-shell'
import { requireLayoutRole } from '@/lib/security/guards'

export default async function NurseLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await requireLayoutRole(['Nurse', 'Admin'])

  return (
    <AppShell
      role="Nurse"
      user={{
        name: session.profileName,
        email: session.user.email ?? '',
      }}
    >
      {children}
    </AppShell>
  )
}