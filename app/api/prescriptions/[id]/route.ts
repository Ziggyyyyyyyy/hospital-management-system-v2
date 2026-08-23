import { createClient } from '@/utils/supabase/server'
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
  const deny = requireRoles(identity, ['Admin', 'Doctor', 'Patient', 'Pharmacist', 'Nurse'])
  if (deny) return err(deny)

  const { id } = await ctx.params
  const prescriptionId = Number(id)
  if (!Number.isFinite(prescriptionId) || prescriptionId <= 0) {
    return err(makeApptError('VALIDATION_ERROR', 'Invalid prescription id'))
  }

  const supabase = await createClient()
  const serviceSupabase = createServiceClient()

  try {
    const { data: prescription, error } = await serviceSupabase
      .from('prescriptions')
      .select(`
        prescription_id,
        appointment_id,
        patient_id,
        doctor_id,
        record_id,
        issue_date,
        expiry_date,
        notes,
        status,
        created_at,
        updated_at,
        prescription_items (
          item_id,
          medicine_id,
          medicine_name,
          dosage,
          frequency,
          duration_days,
          quantity,
          instructions,
          created_at,
          medication_reminders (
            reminder_id,
            prescription_item_id,
            medicine_name,
            dosage,
            scheduled_at,
            status,
            sent_at,
            retry_count
          )
        ),
        appointments (
          appointment_id,
          status,
          reason_for_visit
        ),
        patients (
          patient_id,
          blood_type,
          emergency_contact_id,
          users (first_name, last_name, date_of_birth, gender, phone_number)
        ),
        medical_staff (
          staff_id,
          staff_type,
          license_number,
          departments (name),
          users (first_name, last_name)
        )
      `)
      .eq('prescription_id', prescriptionId)
      .maybeSingle()

    if (error) {
      return err(makeApptError('INTERNAL_ERROR', error.message))
    }

    if (!prescription) {
      return err(makeApptError('APPOINTMENT_NOT_FOUND', 'Prescription not found'))
    }

    const rxAny = prescription as any
    const rxPatientId = Number(rxAny.patient_id)
    const rxDoctorId = Number(rxAny.doctor_id)

    if (identity.role === 'Patient') {
      if (!identity.patientId || rxPatientId !== identity.patientId) {
        return err(makeApptError('FORBIDDEN', 'Not your prescription'))
      }
    } else if (identity.role === 'Doctor') {
      if (!identity.staffId || rxDoctorId !== identity.staffId) {
        return err(makeApptError('FORBIDDEN', 'Not your prescription'))
      }
    }

    void supabase
    return ok({ prescription })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return err(makeApptError('INTERNAL_ERROR', msg))
  }
}
