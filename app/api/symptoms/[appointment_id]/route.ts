import { createClient } from '@/utils/supabase/server'
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
    return err(makeApptError('VALIDATION_ERROR', 'Invalid appointment id'))
  }

  const supabase = (await createClient()) as any

  try {
    const { data: appt, error: apptError } = await supabase
      .from('appointments')
      .select('appointment_id, patient_id, doctor_id')
      .eq('appointment_id', apptId)
      .maybeSingle()

    if (apptError) return err(makeApptError('INTERNAL_ERROR', apptError.message))
    if (!appt) return err(makeApptError('APPOINTMENT_NOT_FOUND', 'Appointment not found'))

    if (identity.role === 'Patient') {
      if (!identity.patientId || appt.patient_id !== identity.patientId) {
        return err(makeApptError('FORBIDDEN', 'Not your appointment'))
      }
    }
    if (identity.role === 'Doctor') {
      if (!identity.staffId || appt.doctor_id !== identity.staffId) {
        return err(makeApptError('FORBIDDEN', 'Not your appointment'))
      }
    }

    const { data, error } = await supabase
      .from('symptom_intakes')
      .select(
        `
        *,
        ai_previsit_summaries (
          summary_id,
          appointment_id,
          status,
          urgency,
          chief_complaint,
          suggested_questions,
          model,
          prompt_version,
          error_message,
          generated_at,
          created_at,
          updated_at
        )
      `,
      )
      .eq('appointment_id', apptId)
      .maybeSingle()

    if (error) return err(makeApptError('INTERNAL_ERROR', error.message))
    if (!data) return err(makeApptError('APPOINTMENT_NOT_FOUND', 'Symptom intake not found for this appointment'))

    const result = {
      ...data,
      symptoms: data.symptoms
        ? data.symptoms.split(', ').map((s: string) => s.trim()).filter(Boolean)
        : [],
      ai_previsit_summary: data.ai_previsit_summaries
        ? Array.isArray(data.ai_previsit_summaries)
          ? data.ai_previsit_summaries[0]
          : data.ai_previsit_summaries
        : null,
    }
    delete (result as any).ai_previsit_summaries

    return ok(result)
  } catch (e: any) {
    return err(makeApptError('INTERNAL_ERROR', e?.message ?? 'Internal error'))
  }
}
