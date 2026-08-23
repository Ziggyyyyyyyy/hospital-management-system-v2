import { createClient } from '@/utils/supabase/server'
import type { ShellUser } from './nav-config'

/**
 * Resolves the display identity for the application shell.
 * Returns null when unauthenticated — layouts then render children
 * unchanged (preserving pre-shell behavior).
 */
export async function getShellUser(): Promise<ShellUser | null> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  let name = ''

  // Preferred source: profile row created at sign-up.
  const { data: profile } = await supabase
    .from('users')
    .select('first_name,last_name')
    .eq('user_id', user.id)
    .single()

  if (profile?.first_name || profile?.last_name) {
    name = [profile.first_name, profile.last_name].filter(Boolean).join(' ')
  }

  // Fallback: auth metadata, then email local-part.
  if (!name) {
    const meta = (user.user_metadata ?? {}) as Record<string, unknown>
    const metaName = [meta.first_name, meta.last_name]
      .filter((value): value is string => typeof value === 'string' && !!value)
      .join(' ')
    if (metaName) name = metaName
  }
  if (!name) name = user.email?.split('@')[0] || 'User'

  return { name, email: user.email ?? '' }
}