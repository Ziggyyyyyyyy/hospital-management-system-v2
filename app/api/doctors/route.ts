import { NextResponse } from 'next/server'
import { createServiceClient } from '@/utils/supabase/service'
import {
  resolveIdentity,
  requireRoles,
  ok,
  err,
} from '@/lib/appointments/api-helpers'
import { makeApptError } from '@/lib/appointments/error-codes'
import { DoctorQuerySchema } from '@/lib/validation/appointment'

/**
 * GET /api/doctors?specialty_id=X&department_id=Y
 * Public-ish endpoint — authenticated users need access to list
 * doctors. Doctor specialties and dept joined.
 */
export async function GET(req: Request) {
  const identity = await resolveIdentity()
  if ('code' in identity) return err(identity)
  const deny = requireRoles(identity, ['Admin', 'Doctor', 'Nurse', 'Patient'])
  if (deny) return err(deny)

  const url = new URL(req.url)
  const queryParsed = DoctorQuerySchema.safeParse({
    specialty_id: url.searchParams.get('specialty_id') ?? undefined,
    department_id: url.searchParams.get('department_id') ?? undefined,
  })
  if (!queryParsed.success) {
    return err(makeApptError('VALIDATION_ERROR', queryParsed.error.message))
  }
  const q = queryParsed.data

  // The medical_staff RLS policy is self-referential and exceeds the
  // PostgreSQL stack depth for authenticated sessions (SQLSTATE 54001).
  // Access is already gated to authenticated roles above, so read through
  // the service client (see utils/supabase/service.ts usage policy).
  const supabase = createServiceClient()

  let query = supabase
    .from('medical_staff')
    .select(
      `
      staff_id,
      user_id,
      department_id,
      staff_type,
      license_number,
      employment_status,
      date_hired,
      users(first_name, last_name),
      doctor_specialties(
        specialty_id,
        is_primary,
        specialty:specialties(specialty_id, name, description, active)
      )
    `,
    )
    .eq('staff_type', 'Doctor')
    .eq('employment_status', 'Active')
    .order('staff_id')

  if (q.department_id) query = query.eq('department_id', q.department_id)
  const { data, error } = await query
  if (error) return err(makeApptError('INTERNAL_ERROR', error.message))

  // post filter by specialty (since the join filter can't be done inline)
  let result = data ?? []
  if (q.specialty_id) {
    result = result.filter((row: any) =>
      (row.doctor_specialties ?? []).some(
        (ds: any) => ds.specialty_id === Number(q.specialty_id),
      ),
    )
  }
  // Flatten name for convenience
  const flattened = result.map((row: any) => ({
    ...row,
    full_name: [row.users?.first_name, row.users?.last_name]
      .filter(Boolean)
      .join(' '),
  }))
  return ok(flattened)
}
