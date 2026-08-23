'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ChevronRight } from 'lucide-react'

const segmentLabels: Record<string, string> = {
  admin: 'Admin',
  dashboard: 'Analytics',
  doctor: 'Doctor',
  nurse: 'Nurse',
  patient: 'Patient',
  pharmacy: 'Pharmacy',
}

function labelFor(segment: string) {
  return (
    segmentLabels[segment] ??
    segment.charAt(0).toUpperCase() + segment.slice(1)
  )
}

export function Breadcrumbs() {
  const pathname = usePathname()
  const segments = pathname.split('/').filter(Boolean)

  if (segments.length === 0) return null

  return (
    <nav aria-label="Breadcrumb" className="min-w-0">
      <ol className="flex min-w-0 items-center gap-1.5 text-sm">
        {segments.map((segment, index) => {
          const href = `/${segments.slice(0, index + 1).join('/')}`
          const isLast = index === segments.length - 1
          return (
            <li
              key={href}
              className="flex min-w-0 items-center gap-1.5"
            >
              {index > 0 && (
                <ChevronRight
                  aria-hidden
                  className="size-3.5 shrink-0 text-muted-foreground/60"
                />
              )}
              {isLast ? (
                <span
                  aria-current="page"
                  className="truncate font-medium text-foreground"
                >
                  {labelFor(segment)}
                </span>
              ) : (
                <Link
                  href={href}
                  className="truncate text-muted-foreground transition-colors hover:text-foreground"
                >
                  {labelFor(segment)}
                </Link>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}