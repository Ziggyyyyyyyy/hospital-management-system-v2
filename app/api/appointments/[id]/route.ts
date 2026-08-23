import { createClient } from '@/utils/supabase/server'
import {
  resolveIdentity,
  requireRoles,
  ok,
  err,
} from '@/lib/appointments/api-helpers'
import { makeApptError } from '@/lib/appointments/error-codes'
import { getAppointment } from '@/lib/appointments/booking-service'

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const identity = await resolveIdentity()
  if ('code' in identity) return err(identity)
  const deny = requireRoles(identity, ['Admin', 'Doctor', 'Patient'])
  if (deny) return err(deny)
  const { id } = await ctx.params
  const apptId = Number(id)
  if (!Number.isFinite(apptId) || apptId <= 0) {
    return err(makeApptError('VALIDATION_ERROR', 'Invalid appointment id'))
  }
  const supabase = (await createClient()) as any
  const appt = await getAppointment(apptId, supabase)
  if (!appt) return err(makeApptError('APPOINTMENT_NOT_FOUND', 'Not found'))
  // Enforce ownership
  if (identity.role === 'Patient' && appt.patient_id !== identity.patientId) {
    return err(makeApptError('FORBIDDEN', 'Not your appointment'))
  }
  if (identity.role === 'Doctor' && appt.doctor_id !== identity.staffId) {
    return err(makeApptError('FORBIDDEN', 'Not your appointment'))
  }
  return ok(appt)
}
