import { createServiceClient } from '@/utils/supabase/service'
import {
  resolveIdentity,
  requireRoles,
  ok,
  err,
} from '@/lib/appointments/api-helpers'
import { makeApptError } from '@/lib/appointments/error-codes'
import {
  listPatientAppointments,
  listDoctorAppointments,
} from '@/lib/appointments/booking-service'

/**
 * GET /api/appointments
 *
 * Patient → own appointments.
 * Doctor  → own appointments.
 * Admin   → all appointments (todo: add pagination).
 */
export async function GET() {
  const identity = await resolveIdentity()
  if ('code' in identity) return err(identity)
  const deny = requireRoles(identity, ['Admin', 'Doctor', 'Patient'])
  if (deny) return err(deny)

  // The appointments RLS policy participates in the self-referential policy
  // cycle that exceeds the PostgreSQL stack depth for authenticated
  // sessions (SQLSTATE 54001). Identity and role are resolved above, and
  // every branch below filters on the caller's own patient_id/doctor_id,
  // so reads run through the service client (see utils/supabase/service.ts).
  const supabase = createServiceClient() as any
  try {
    if (identity.role === 'Patient') {
      if (!identity.patientId) {
        return err(makeApptError('FORBIDDEN', 'Patient profile missing'))
      }
      const list = await listPatientAppointments(identity.patientId, supabase)
      return ok({ appointments: list })
    }
    if (identity.role === 'Doctor') {
      if (!identity.staffId) {
        return err(makeApptError('FORBIDDEN', 'Doctor profile missing'))
      }
      const list = await listDoctorAppointments(identity.staffId, supabase)
      return ok({ appointments: list })
    }
    // Admin
    const { data, error } = await supabase
      .from('appointments')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500)
    if (error) return err(makeApptError('INTERNAL_ERROR', error.message))
    return ok({ appointments: data ?? [] })
  } catch (e: any) {
    return err(makeApptError('INTERNAL_ERROR', e?.message ?? 'Internal error'))
  }
}
