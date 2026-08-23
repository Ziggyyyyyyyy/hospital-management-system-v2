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
    const { data: summary, error } = await serviceSupabase
      .from('post_visit_summaries')
      .select(`
        summary_id,
        appointment_id,
        patient_id,
        doctor_id,
        note_id,
        visit_explanation,
        medication_sched,
        follow_up_steps,
        instructions,
        model,
        prompt_version,
        status,
        error_message,
        generated_at,
        created_at,
        updated_at,
        post_visit_notes (
          note_id,
          clinical_notes,
          diagnosis,
          follow_up_instr,
          created_at
        ),
        appointments (
          appointment_id,
          status,
          patients:patient_id (
            patient_id,
            users (first_name, last_name)
          ),
          medical_staff:doctor_id (
            staff_id,
            users (first_name, last_name)
          )
        )
      `)
      .eq('appointment_id', apptId)
      .maybeSingle()

    if (error) {
      return err(makeApptError('INTERNAL_ERROR', error.message))
    }

    if (!summary) {
      return err(
        makeApptError('APPOINTMENT_NOT_FOUND', 'Post-visit summary not found'),
      )
    }

    const sumAny = summary as any
    const sumPatientId = Number(sumAny.patient_id)
    const sumDoctorId = Number(sumAny.doctor_id)

    if (identity.role === 'Patient') {
      if (!identity.patientId || sumPatientId !== identity.patientId) {
        return err(makeApptError('FORBIDDEN', 'Not your post-visit summary'))
      }
    } else if (identity.role === 'Doctor') {
      if (!identity.staffId || sumDoctorId !== identity.staffId) {
        return err(makeApptError('FORBIDDEN', 'Not your post-visit summary'))
      }
    }

    void supabase
    return ok({ summary })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return err(makeApptError('INTERNAL_ERROR', msg))
  }
}
