import { AppShell } from '@/components/shell/app-shell'
import { requireLayoutRole } from '@/lib/security/guards'

export default async function PharmacyLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await requireLayoutRole(['Pharmacist', 'Admin'])

  return (
    <AppShell
      role="Pharmacist"
      user={{
        name: session.profileName,
        email: session.user.email ?? '',
      }}
    >
      {children}
    </AppShell>
  )
}