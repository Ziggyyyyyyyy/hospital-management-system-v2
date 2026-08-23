'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { ChevronsUpDown, HeartPulse, LogOut } from 'lucide-react'

import { signOutAction } from '@/app/actions'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
  useSidebar,
} from '@/components/ui/sidebar'
import { Separator } from '@/components/ui/separator'
import { Breadcrumbs } from './breadcrumbs'
import {
  navHref,
  roleNav,
  type AppRole,
  type NavItem,
  type NavSection,
  type ShellUser,
} from './nav-config'

function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/).slice(0, 2)
  const initials = parts.map((part) => part.charAt(0)).join('').toUpperCase()
  return initials || 'U'
}

/** Tracks the URL hash so in-page section items can highlight precisely. */
function useCurrentHash() {
  const [hash, setHash] = useState('')
  useEffect(() => {
    const update = () => setHash(window.location.hash)
    update()
    window.addEventListener('hashchange', update)
    return () => window.removeEventListener('hashchange', update)
  }, [])
  return hash
}

function BrandButton({ role }: { role: AppRole }) {
  const home = roleNav[role].sections[0]?.items[0]?.url ?? '/'
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton size="lg" asChild tooltip="HMS">
          <Link href={home}>
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <HeartPulse className="size-4" aria-hidden />
            </span>
            <span className="grid min-w-0 flex-1 leading-tight">
              <span className="truncate font-display font-semibold tracking-tight">
                HMS
              </span>
              <span className="truncate text-xs text-muted-foreground">
                {roleNav[role].tagline}
              </span>
            </span>
          </Link>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}

function UserMenu({ user }: { user: ShellUser }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <SidebarMenuButton
          size="lg"
          className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
        >
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
            {initialsOf(user.name)}
          </span>
          <span className="grid min-w-0 flex-1 leading-tight text-left">
            <span className="truncate font-medium">{user.name}</span>
            <span className="truncate text-xs text-muted-foreground">
              {user.email}
            </span>
          </span>
          <ChevronsUpDown
            aria-hidden
            className="ml-auto size-4 shrink-0 text-muted-foreground"
          />
        </SidebarMenuButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side="top"
        align="start"
        className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
      >
        <DropdownMenuLabel className="p-0 font-normal">
          <div className="flex items-center gap-2 px-2 py-1.5 text-left text-sm">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
              {initialsOf(user.name)}
            </span>
            <span className="grid min-w-0 flex-1 leading-tight">
              <span className="truncate font-medium">{user.name}</span>
              <span className="truncate text-xs text-muted-foreground">
                {user.email}
              </span>
            </span>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <form action={signOutAction}>
          <button
            type="submit"
            className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-destructive outline-hidden transition-colors hover:bg-accent hover:text-destructive focus-visible:bg-accent"
          >
            <LogOut className="size-4" aria-hidden />
            Sign out
          </button>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/**
 * Rendered inside SidebarProvider so it can access the sidebar context
 * (used to close the mobile Sheet after a navigation tap).
 */
function ShellNavMenu({
  sections,
  isItemActive,
}: {
  sections: NavSection[]
  isItemActive: (item: NavItem) => boolean
}) {
  const { isMobile, setOpenMobile } = useSidebar()

  return (
    <>
      {sections.map((section) => (
        <SidebarGroup key={section.label}>
          <SidebarGroupLabel>{section.label}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {section.items.map((item) => (
                <SidebarMenuItem key={`${item.title}-${item.hash ?? 'page'}`}>
                  <SidebarMenuButton
                    asChild
                    isActive={isItemActive(item)}
                    tooltip={item.title}
                  >
                    <Link
                      href={navHref(item)}
                      onClick={() => {
                        if (isMobile) setOpenMobile(false)
                      }}
                    >
                      <item.icon aria-hidden />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      ))}
    </>
  )
}

export function AppShell({
  role,
  user,
  children,
}: {
  role: AppRole
  user: ShellUser
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const hash = useCurrentHash()
  const sections = roleNav[role].sections

  // Plain items highlight on an exact path match while no section hash is
  // active; anchor items highlight only while their section hash matches.
  const isItemActive = (item: NavItem) => {
    if (pathname !== item.url) return false
    if (item.hash) return hash === `#${item.hash}`
    return !hash
  }

  return (
    <SidebarProvider>
      <Sidebar collapsible="icon">
        <SidebarHeader>
          <BrandButton role={role} />
        </SidebarHeader>

        <SidebarContent>
          <ShellNavMenu sections={sections} isItemActive={isItemActive} />
        </SidebarContent>

        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <UserMenu user={user} />
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>

        <SidebarRail />
      </Sidebar>

      <SidebarInset>
        {/* Sits directly beneath the global sticky header (h-16). */}
        <header className="sticky top-16 z-30 flex h-14 shrink-0 items-center gap-2 border-b border-border bg-background/85 px-4 backdrop-blur transition-[width,height] ease-linear supports-[backdrop-filter]:bg-background/70">
          <SidebarTrigger className="-ml-1 text-muted-foreground hover:text-foreground" />
          <Separator orientation="vertical" className="mr-1 h-4" />
          <Breadcrumbs />
        </header>
        <main className="flex flex-1 flex-col">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  )
}