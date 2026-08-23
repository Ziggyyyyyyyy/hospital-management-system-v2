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
    return err(makeApptError('VALIDATION_ERROR', 'Invalid appointment id'))
  }

  // The appointments RLS policy participates in the self-referential
  // policy cycle that exceeds the PostgreSQL stack depth for
  // authenticated sessions (SQLSTATE 54001). Ownership is enforced in
  // code below against identity resolved above, so read through the
  // service client (see utils/supabase/service.ts usage policy).
  const supabase = createServiceClient() as any

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
      .from('ai_previsit_summaries')
      .select('summary_id, appointment_id, status, urgency, chief_complaint, suggested_questions, error_message, generated_at, created_at, updated_at')
      .eq('appointment_id', apptId)
      .maybeSingle()

    if (error) return err(makeApptError('INTERNAL_ERROR', error.message))

    if (!data) {
      return ok({
        appointment_id: apptId,
        status: 'PENDING',
        urgency: null,
        chief_complaint: null,
        suggested_questions: [],
        error_message: null,
        summary: null,
      })
    }

    return ok({
      summary_id: data.summary_id,
      appointment_id: data.appointment_id,
      status: data.status,
      urgency: data.urgency,
      chief_complaint: data.chief_complaint,
      suggested_questions: Array.isArray(data.suggested_questions) ? data.suggested_questions : [],
      error_message: data.error_message,
      generated_at: data.generated_at,
      created_at: data.created_at,
      updated_at: data.updated_at,
    })
  } catch (e: any) {
    return err(makeApptError('INTERNAL_ERROR', e?.message ?? 'Internal error'))
  }
}
