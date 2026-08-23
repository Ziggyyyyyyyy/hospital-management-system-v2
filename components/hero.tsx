import Link from 'next/link'
import {
  ArrowRight,
  CalendarClock,
  ClipboardList,
  Pill,
  ShieldCheck,
  Sparkles,
  Stethoscope,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

const roleCards = [
  {
    icon: Stethoscope,
    title: 'Doctors',
    description:
      'Appointments, admissions, prescriptions and post-visit notes in one focused clinical workspace.',
  },
  {
    icon: ClipboardList,
    title: 'Nurses',
    description:
      'Assigned patients, room assignments and daily schedules — always current, always at a glance.',
  },
  {
    icon: Pill,
    title: 'Pharmacists',
    description:
      'Live stock levels, low-stock alerts and one-click dispensing across the entire formulary.',
  },
  {
    icon: ShieldCheck,
    title: 'Administrators',
    description:
      'Staff management, patient billing and analytics dashboards for confident, data-driven decisions.',
  },
]

const stats = [
  { value: '5', label: 'Role-based workspaces' },
  { value: '19', label: 'Integrated service modules' },
  { value: '100%', label: 'End-to-end type safety' },
  { value: '2', label: 'Clinical themes, light & dark' },
]

const modules = [
  'Appointments',
  'Medical records',
  'Admissions & rooms',
  'Pharmacy inventory',
  'Billing',
  'Notifications & calendar',
  'AI visit summaries',
]

const trustPoints = [
  { icon: ShieldCheck, label: 'Role-based access control' },
  { icon: CalendarClock, label: 'Real-time scheduling' },
  { icon: Sparkles, label: 'AI-assisted documentation' },
]

function AmbientBackground() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      {/* Faint clinical grid, fading out toward the fold */}
      <div className="absolute inset-0 opacity-60 [background-image:linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] [background-size:56px_56px] [mask-image:radial-gradient(ellipse_65%_55%_at_50%_0%,black_45%,transparent)]" />
      {/* Soft brand glows */}
      <div className="absolute -top-40 left-1/2 h-[420px] w-[min(48rem,90vw)] -translate-x-1/2 rounded-full bg-primary/15 blur-[120px]" />
      <div className="absolute right-[6%] top-64 hidden h-56 w-56 rounded-full bg-accent/40 blur-[100px] lg:block" />
      {/* ECG pulse line */}
      <svg
        className="absolute left-0 top-24 hidden w-full text-primary/20 md:block"
        viewBox="0 0 1200 120"
        fill="none"
        preserveAspectRatio="none"
      >
        <path
          d="M0 78 H300 L318 78 L330 54 L344 98 L358 26 L372 102 L386 78 H560 L574 66 L588 78 H1200"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  )
}

export default function Hero() {
  return (
    <div className="relative overflow-hidden">
      <AmbientBackground />

      {/* ---------- Hero ---------- */}
      <section
        aria-label="Introduction"
        className="relative container mx-auto px-4 pb-16 pt-20 text-center md:pb-20 md:pt-28"
      >
        <Badge
          variant="outline"
          className="gap-2 rounded-full px-3.5 py-1.5 text-xs font-medium text-muted-foreground shadow-elevation-sm"
        >
          <span className="status-dot animate-pulse bg-success" aria-hidden />
          One platform for the entire care team
        </Badge>

        <h1 className="mx-auto mt-6 max-w-3xl text-balance font-display text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl">
          Hospital operations,{' '}
          <span className="text-primary">in perfect sync.</span>
        </h1>

        <p className="mx-auto mt-5 max-w-2xl text-pretty text-base text-muted-foreground sm:text-lg">
          Securely manage patients, appointments, admissions, pharmacy
          inventory and billing — a calm, legible workspace designed for
          long shifts and critical decisions.
        </p>

        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Button
            asChild
            size="lg"
            className="w-full shadow-elevation-md hover:shadow-elevation-lg sm:w-auto"
          >
            <Link href="/sign-up">
              Get started
              <ArrowRight className="transition-transform group-hover:translate-x-0.5" />
            </Link>
          </Button>
          <Button
            asChild
            size="lg"
            variant="outline"
            className="w-full sm:w-auto"
          >
            <Link href="/sign-in">Sign in</Link>
          </Button>
        </div>

        <ul className="mt-7 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
          {trustPoints.map(({ icon: Icon, label }) => (
            <li key={label} className="flex items-center gap-1.5">
              <Icon className="size-4 text-primary" aria-hidden />
              {label}
            </li>
          ))}
        </ul>
      </section>

      {/* ---------- Role cards ---------- */}
      <section
        aria-label="Role-based workspaces"
        className="relative container mx-auto px-4 pb-16 md:pb-24"
      >
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-primary">
            Built for every role
          </p>
          <h2 className="mt-2 font-display text-2xl font-bold tracking-tight sm:text-3xl">
            Purpose-built workspaces
          </h2>
          <p className="mt-3 text-muted-foreground">
            Each member of your team signs in to a dashboard shaped around
            exactly what they need — nothing more, nothing less.
          </p>
        </div>

        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {roleCards.map(({ icon: Icon, title, description }) => (
            <Card
              key={title}
              className="group h-full transition-all duration-200 hover:-translate-y-1 hover:shadow-elevation-md"
            >
              <CardContent className="p-6">
                <div className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary/15">
                  <Icon className="size-5" aria-hidden />
                </div>
                <h3 className="mt-4 font-display text-base font-semibold">
                  {title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {description}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* ---------- Trust / statistics ---------- */}
      <section
        aria-label="Platform statistics"
        className="relative border-y border-border bg-secondary/40"
      >
        <div className="container mx-auto px-4 py-12 md:py-14">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-8 text-center lg:grid-cols-4">
            {stats.map(({ value, label }) => (
              <div key={label}>
                <dd className="font-display text-3xl font-bold tracking-tight text-primary sm:text-4xl">
                  {value}
                </dd>
                <dt className="mt-1.5 text-sm text-muted-foreground">
                  {label}
                </dt>
              </div>
            ))}
          </dl>

          <div className="mt-10 flex flex-wrap items-center justify-center gap-2">
            <span className="mr-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Includes
            </span>
            {modules.map((module) => (
              <Badge
                key={module}
                variant="outline"
                className="rounded-full bg-card px-3 py-1 text-xs font-normal text-muted-foreground"
              >
                {module}
              </Badge>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- Closing CTA ---------- */}
      <section
        aria-label="Call to action"
        className="relative container mx-auto px-4 py-16 md:py-24"
      >
        <div className="relative overflow-hidden rounded-3xl bg-primary px-6 py-14 text-center text-primary-foreground shadow-elevation-lg md:py-16">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
          >
            <div className="absolute -right-24 -top-24 size-72 rounded-full bg-primary-foreground/10 blur-2xl" />
            <div className="absolute -bottom-28 -left-20 size-80 rounded-full bg-primary-foreground/10 blur-2xl" />
          </div>

          <h2 className="relative mx-auto max-w-2xl text-balance font-display text-2xl font-bold tracking-tight sm:text-3xl md:text-4xl">
            Ready to modernize your hospital?
          </h2>
          <p className="relative mx-auto mt-3 max-w-xl text-pretty text-primary-foreground/85">
            Create an account and explore every workspace — from the ward to
            the pharmacy counter — in minutes.
          </p>
          <div className="relative mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button
              asChild
              size="lg"
              className="w-full bg-primary-foreground text-primary shadow-none hover:bg-primary-foreground/90 sm:w-auto"
            >
              <Link href="/sign-up">
                Create account
                <ArrowRight />
              </Link>
            </Button>
            <Link
              href="/sign-in"
              className="inline-flex h-10 w-full items-center justify-center whitespace-nowrap rounded-md border border-primary-foreground/30 px-6 text-sm font-medium transition-colors hover:bg-primary-foreground/10 sm:w-auto"
            >
              Sign in
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}