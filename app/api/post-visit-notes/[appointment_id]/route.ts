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
  ctx: { params: Promise<{ appointment_id: string }> },
) {
  const identity = await resolveIdentity()
  if ('code' in identity) return err(identity)
  const deny = requireRoles(identity, ['Admin', 'Doctor', 'Patient'])
  if (deny) return err(deny)

  const { appointment_id } = await ctx.params
  const apptId = Number(appointment_id)
  if (!Number.isFinite(apptId) || apptId <= 0) {
    return err(makeApptError('VALIDATION_ERROR', 'Invalid appointment_id'))
  }

  const supabase = await createClient()
  const serviceSupabase = createServiceClient()

  try {
    const { data: note, error } = await serviceSupabase
      .from('post_visit_notes')
      .select(`
        note_id,
        appointment_id,
        patient_id,
        doctor_id,
        clinical_notes,
        diagnosis,
        follow_up_instr,
        created_at,
        updated_at,
        appointments!post_visit_notes_appointment_id_fkey (
          appointment_id,
          status,
          reason_for_visit,
          patients:patient_id (
            patient_id,
            date_of_birth,
            gender,
            users (first_name, last_name, email, phone)
          ),
          medical_staff:doctor_id (
            staff_id,
            staff_type,
            specialty,
            users (first_name, last_name, email)
          )
        ),
        post_visit_summaries!post_visit_summaries_appointment_id_fkey (
          summary_id,
          appointment_id,
          visit_explanation,
          medication_sched,
          follow_up_steps,
          instructions,
          status,
          model,
          error_message,
          generated_at
        )
      `)
      .eq('appointment_id', apptId)
      .maybeSingle()

    if (error) {
      return err(makeApptError('INTERNAL_ERROR', error.message))
    }

    if (!note) {
      return err(makeApptError('APPOINTMENT_NOT_FOUND', 'Post-visit note not found'))
    }

    const noteAny = note as any
    const notePatientId = Number(noteAny.patient_id)
    const noteDoctorId = Number(noteAny.doctor_id)

    if (identity.role === 'Patient') {
      if (!identity.patientId || notePatientId !== identity.patientId) {
        return err(makeApptError('FORBIDDEN', 'Not your post-visit note'))
      }
    } else if (identity.role === 'Doctor') {
      if (!identity.staffId || noteDoctorId !== identity.staffId) {
        return err(makeApptError('FORBIDDEN', 'Not your post-visit note'))
      }
    }

    void supabase
    return ok({ note })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return err(makeApptError('INTERNAL_ERROR', msg))
  }
}
