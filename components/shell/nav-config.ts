import {
  BarChart3,
  CalendarClock,
  ClipboardList,
  CreditCard,
  HeartPulse,
  LayoutDashboard,
  Pill,
  Stethoscope,
  UserRound,
  Users,
  type LucideIcon,
} from 'lucide-react'

export type AppRole = 'Admin' | 'Doctor' | 'Nurse' | 'Pharmacist' | 'Patient'

export interface NavItem {
  title: string
  url: string
  icon: LucideIcon
  /**
   * Optional in-page section anchor. When set, the item links to
   * `${url}#${hash}` and highlights only while that section hash is
   * active — letting one page host several nav destinations without
   * new routes.
   */
  hash?: string
}

export interface NavSection {
  label: string
  items: NavItem[]
}

export interface ShellUser {
  name: string
  email: string
}

/** Resolves the navigable href for a nav item. */
export function navHref(item: NavItem): string {
  return item.hash ? `${item.url}#${item.hash}` : item.url
}

/**
 * Navigation shown in the application shell, keyed by the authenticated
 * user's role. URLs map onto existing routes — no new routes introduced.
 */
export const roleNav: Record<
  AppRole,
  { tagline: string; sections: NavSection[] }
> = {
  Admin: {
    tagline: 'Administration console',
    sections: [
      {
        label: 'Overview',
        items: [
          { title: 'Overview', url: '/admin', icon: LayoutDashboard },
          { title: 'Analytics', url: '/admin/dashboard', icon: BarChart3 },
        ],
      },
      {
        label: 'Management',
        items: [
          // Sections of the existing /admin workspace — addressed via
          // anchors until dedicated pages are introduced.
          { title: 'Staff', url: '/admin', hash: 'staff', icon: Users },
          { title: 'Patients', url: '/admin', hash: 'patients', icon: UserRound },
          {
            title: 'Appointments',
            url: '/admin',
            hash: 'appointments',
            icon: CalendarClock,
          },
          { title: 'Billing', url: '/admin', hash: 'billing', icon: CreditCard },
        ],
      },
    ],
  },
  Doctor: {
    tagline: 'Clinical workspace',
    sections: [
      {
        label: 'Workspace',
        items: [{ title: 'Dashboard', url: '/doctor', icon: Stethoscope }],
      },
    ],
  },
  Nurse: {
    tagline: 'Care workspace',
    sections: [
      {
        label: 'Workspace',
        items: [{ title: 'Dashboard', url: '/nurse', icon: ClipboardList }],
      },
    ],
  },
  Pharmacist: {
    tagline: 'Inventory workspace',
    sections: [
      {
        label: 'Workspace',
        items: [{ title: 'Dashboard', url: '/pharmacy', icon: Pill }],
      },
    ],
  },
  Patient: {
    tagline: 'My health hub',
    sections: [
      {
        label: 'Workspace',
        items: [{ title: 'Dashboard', url: '/patient', icon: HeartPulse }],
      },
    ],
  },
}