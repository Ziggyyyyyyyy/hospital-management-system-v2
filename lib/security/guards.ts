import { createClient } from '@/utils/supabase/server'
import { createServiceClientRaw } from '@/utils/supabase/service'
import { redirect } from 'next/navigation'
import { NextResponse } from 'next/server'
import {
  type UserRole,
  getDefaultRouteForRole,
  isValidRole,
} from './roles'

export interface AuthenticatedSession {
  user: {
    id: string
    email?: string
  }
  role: UserRole
  staffId: number | null
  patientId: number | null
  profileName: string
}

/**
 * Resolves the authenticated session, role, and domain IDs (patient_id/staff_id)
 * using the verified JWT subject.
 */
export async function getAuthenticatedSession(): Promise<AuthenticatedSession | null> {
  const supabase = await createClient()

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    return null
  }

  // Use service client for rapid, non-recursive identity resolution
  const service = createServiceClientRaw()

  const [staffResult, patientResult, userProfileResult] = await Promise.all([
    service
      .from('medical_staff')
      .select('staff_id, staff_type')
      .eq('user_id', user.id)
      .maybeSingle(),
    service
      .from('patients')
      .select('patient_id')
      .eq('user_id', user.id)
      .maybeSingle(),
    service
      .from('users')
      .select('first_name, last_name')
      .eq('user_id', user.id)
      .maybeSingle(),
  ])

  let role: UserRole = 'Patient'
  let staffId: number | null = null
  let patientId: number | null = null

  if (staffResult.data?.staff_type && isValidRole(staffResult.data.staff_type)) {
    role = staffResult.data.staff_type
    staffId = staffResult.data.staff_id
  }

  if (patientResult.data?.patient_id) {
    patientId = patientResult.data.patient_id
  }

  let profileName = user.email?.split('@')[0] || 'User'
  if (userProfileResult.data?.first_name || userProfileResult.data?.last_name) {
    profileName = [
      userProfileResult.data.first_name,
      userProfileResult.data.last_name,
    ]
      .filter(Boolean)
      .join(' ')
  }

  return {
    user: {
      id: user.id,
      email: user.email,
    },
    role,
    staffId,
    patientId,
    profileName,
  }
}

/**
 * Server Component / Layout guard.
 * Redirects unauthenticated users to `/sign-in` and unauthorized roles
 * to their default role dashboard.
 */
export async function requireLayoutRole(
  allowedRoles: UserRole | UserRole[],
): Promise<AuthenticatedSession> {
  const session = await getAuthenticatedSession()

  if (!session) {
    redirect('/sign-in')
  }

  const allowed = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles]
  if (!allowed.includes(session.role) && session.role !== 'Admin') {
    // Non-admin accessing forbidden role layout: redirect to their own home
    redirect(getDefaultRouteForRole(session.role))
  }

  return session
}

/**
 * API Route Handler Guard.
 * Returns either `{ session, errorResponse: null }` or `{ session: null, errorResponse: NextResponse }`.
 */
export async function requireApiAuth(
  allowedRoles?: UserRole | UserRole[],
): Promise<
  | { session: AuthenticatedSession; errorResponse: null }
  | { session: null; errorResponse: NextResponse }
> {
  const session = await getAuthenticatedSession()

  if (!session) {
    return {
      session: null,
      errorResponse: NextResponse.json(
        { error: 'Unauthorized: Valid authentication session required' },
        { status: 401 },
      ),
    }
  }

  if (allowedRoles) {
    const allowed = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles]
    if (!allowed.includes(session.role) && session.role !== 'Admin') {
      return {
        session: null,
        errorResponse: NextResponse.json(
          {
            error: `Forbidden: Requires one of [${allowed.join(', ')}]. Current role: ${session.role}`,
          },
          { status: 403 },
        ),
      }
    }
  }

  return { session, errorResponse: null }
}

/**
 * Asserts ownership of a resource. Throws an Error if mismatch occurs.
 */
export function assertOwnership(
  actualOwnerId: string | number | null | undefined,
  expectedOwnerId: string | number,
  errorMessage = 'Access denied: You do not have permission to access this resource',
): void {
  if (actualOwnerId == null || String(actualOwnerId) !== String(expectedOwnerId)) {
    const error = new Error(errorMessage) as Error & { status?: number }
    error.status = 403
    throw error
  }
}
