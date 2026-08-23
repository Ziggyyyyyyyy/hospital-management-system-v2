import { createServerClient } from '@supabase/ssr'

/**
 * Server-role Supabase client.
 *
 * ⚠️  SERVER-ONLY. NEVER import this from a client component.
 * ⚠️  Uses SERVICE_ROLE_KEY which bypasses RLS — only use where elevated
 *     privileges are required (slot generation, admin writes, booking
 *     lock acquisitions, test harnesses).
 *
 * For normal user-scoped operations (patient booking confirm, doctor
 * reading schedule, etc.) always prefer `createClient` in
 * utils/supabase/server.ts which runs with the caller's anon session
 * and enforces RLS.
 */
export const createServiceClient = () => {
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceRole) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY is not set. Cannot create service client.',
    )
  }
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceRole,
    {
      cookies: {
        // The service-role client performs stateless, elevated queries only.
        // It never establishes or refreshes a user session, so there are no
        // cookies to read and cookie writes are intentionally ignored.
        getAll() {
          return []
        },
        setAll() {},
      },
    },
  )
}

/** Same as above but returning the raw @supabase/supabase-js client for
 *  scripts/tests that don't need SSR cookie handling. */
export const createServiceClientRaw = () => {
  const { createClient } = require('@supabase/supabase-js')
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceRole) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set.')
  }
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
