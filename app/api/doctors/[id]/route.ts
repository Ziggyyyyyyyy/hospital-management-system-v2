import { createServiceClient } from '@/utils/supabase/service'
import {
  resolveIdentity,
  requireRoles,
  ok,
  err,
} from '@/lib/appointments/api-helpers'
import { makeApptError } from '@/lib/appointments/error-codes'

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const identity = await resolveIdentity()
  if ('code' in identity) return err(identity)
  const deny = requireRoles(identity, ['Admin', 'Doctor', 'Nurse', 'Patient'])
  if (deny) return err(deny)

  const { id } = await ctx.params
  const doctorId = Number(id)
  if (!Number.isFinite(doctorId) || doctorId <= 0) {
    return err(makeApptError('VALIDATION_ERROR', 'Invalid doctor id'))
  }
  const supabase = createServiceClient()
  const { data, error } = await supabase
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
      users!inner(first_name, last_name, phone_number),
      departments:departments(department_id, name),
      doctor_specialties(
        specialty_id,
        is_primary,
        specialty:specialties(specialty_id, name, description, active)
      ),
      availability:doctor_availability(*)
    `,
    )
    .eq('staff_id', doctorId)
    .eq('staff_type', 'Doctor')
    .maybeSingle()
  if (error) return err(makeApptError('INTERNAL_ERROR', error.message))
  if (!data) return err(makeApptError('DOCTOR_NOT_FOUND', 'Doctor not found'))
  return ok(data)
}
