import { AppShell } from '@/components/shell/app-shell'
import { requireLayoutRole } from '@/lib/security/guards'

export default async function DoctorLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await requireLayoutRole(['Doctor', 'Admin'])

  return (
    <AppShell
      role="Doctor"
      user={{
        name: session.profileName,
        email: session.user.email ?? '',
      }}
    >
      {children}
    </AppShell>
  )
}