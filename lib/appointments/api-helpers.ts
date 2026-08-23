import { createClient } from '../../utils/supabase/server'
import { createServiceClient } from '../../utils/supabase/service'
import { getUserRole } from '../../utils/get-role'
import type { ApptErrorResult } from '../../lib/validation/appointment'
import { makeApptError } from '../../lib/appointments/error-codes'
import { NextResponse } from 'next/server'

export async function jsonWithCors<T>(body: T, init: ResponseInit = {}) {
  return NextResponse.json(body, {
    headers: {
      'Cache-Control': 'no-store',
      ...(init.headers ?? {}),
    },
    ...init,
  })
}

export function ok<T>(body: T, status = 200) {
  return jsonWithCors({ success: true, data: body } as { success: true; data: T }, { status })
}

export function err(error: ApptErrorResult, statusOverride?: number) {
  return jsonWithCors(
    { success: false, error: { code: error.code, message: error.message, details: error.details } },
    { status: statusOverride ?? error.statusCode },
  )
}

export interface RequestIdentity {
  userId: string
  role: 'Admin' | 'Doctor' | 'Nurse' | 'Pharmacist' | 'Patient'
  // Populated for Patient role (resolved from patients.user_id)
  patientId?: number
  // Populated for Doctor/Nurse/Pharmacist role (resolved from medical_staff.user_id)
  staffId?: number
}

export async function resolveIdentity(minimumRoleHint?: string): Promise<
  | RequestIdentity
  | ApptErrorResult
> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return makeApptError('UNAUTHORIZED', 'Authentication required')
  }
  // getUserRole() resolves the session itself and returns { role, userId }.
  const result = await getUserRole()
  if (!result) {
    return makeApptError('UNAUTHORIZED', 'Could not resolve role')
  }
  const { role } = result
  const identity: RequestIdentity = {
    userId: user.id,
    role: role as RequestIdentity['role'],
  }

  // Self-id lookups run through the service client: the medical_staff RLS
  // policy is self-referential and exceeds the PostgreSQL stack depth for
  // authenticated sessions (SQLSTATE 54001). Identity resolution is an
  // authorization concern keyed off the verified JWT subject.
  const db = createServiceClient()
  const staffRoles: Array<RequestIdentity['role']> = [
    'Doctor',
    'Nurse',
    'Pharmacist',
    'Admin',
  ]
  if (role === 'Patient') {
    const { data } = await db
      .from('patients')
      .select('patient_id')
      .eq('user_id', user.id)
      .maybeSingle()
    if (data) identity.patientId = Number(data.patient_id)
  } else if (staffRoles.includes(role as RequestIdentity['role'])) {
    const { data } = await db
      .from('medical_staff')
      .select('staff_id')
      .eq('user_id', user.id)
      .maybeSingle()
    if (data) identity.staffId = Number(data.staff_id)
  }
  return identity
}

export function requireRoles(
  identity: RequestIdentity,
  allowed: Array<'Admin' | 'Doctor' | 'Nurse' | 'Pharmacist' | 'Patient'>,
): ApptErrorResult | null {
  if (!allowed.includes(identity.role)) {
    return makeApptError('FORBIDDEN', `Role ${identity.role} not allowed`)
  }
  return null
}
