import { createClient } from '@/utils/supabase/server'
import { createServiceClientRaw } from '@/utils/supabase/service'
import {
  resolveIdentity,
  requireRoles,
  ok,
  err,
} from '@/lib/appointments/api-helpers'
import { makeApptError } from '@/lib/appointments/error-codes'
import { SymptomIntakeSchema } from '@/lib/validation/appointment'
import { triggerOrSkip } from '@/lib/ai/previsit-service'

export async function POST(req: Request) {
  const identity = await resolveIdentity()
  if ('code' in identity) return err(identity)
  const deny = requireRoles(identity, ['Admin', 'Doctor', 'Patient'])
  if (deny) return err(deny)

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return err(makeApptError('VALIDATION_ERROR', 'Invalid JSON body'))
  }

  const parsed = SymptomIntakeSchema.safeParse(body)
  if (!parsed.success) {
    const details = parsed.error.issues.map((i) => ({
      path: i.path.join('.'),
      message: i.message,
    }))
    return err(makeApptError('VALIDATION_ERROR', 'Validation failed', { issues: details }))
  }

  const input = parsed.data
  const supabase = (await createClient()) as any
  const serviceSupabase = createServiceClientRaw() as any

  try {
    const { data: appt, error: apptError } = await supabase
      .from('appointments')
      .select('appointment_id, patient_id, doctor_id')
      .eq('appointment_id', String(input.appointment_id))
      .maybeSingle()

    if (apptError) {
      return err(makeApptError('INTERNAL_ERROR', apptError.message))
    }
    if (!appt) {
      return err(makeApptError('APPOINTMENT_NOT_FOUND', 'Appointment not found'))
    }

    if (identity.role === 'Patient') {
      if (
        !identity.patientId ||
        Number(appt.patient_id) !== Number(identity.patientId)
      ) {
        return err(makeApptError('FORBIDDEN', 'Not your appointment'))
      }
      if (Number(input.patient_id) !== Number(identity.patientId)) {
        return err(makeApptError('FORBIDDEN', 'patient_id mismatch'))
      }
    }
    if (identity.role === 'Doctor') {
      if (!identity.staffId || appt.doctor_id !== identity.staffId) {
        return err(makeApptError('FORBIDDEN', 'Not your appointment'))
      }
    }
    if (Number(input.patient_id) !== Number(appt.patient_id)) {
      return err(makeApptError('VALIDATION_ERROR', 'patient_id does not match appointment'))
    }

    const symptomsText = Array.isArray(input.symptoms)
      ? input.symptoms.join(', ')
      : String(input.symptoms)

    const { data: upserted, error: upsertError } = await serviceSupabase
      .from('symptom_intakes')
      .upsert(
        {
          appointment_id: input.appointment_id,
          patient_id: input.patient_id,
          symptoms: symptomsText,
          severity: input.severity,
          duration_text: input.duration_text,
          worsening: input.worsening,
          additional_context: input.additional_context ?? null,
          ai_processing_consent: input.ai_processing_consent,
        },
        { onConflict: 'appointment_id' },
      )
      .select('*')
      .maybeSingle()

    if (upsertError) {
      return err(makeApptError('INTERNAL_ERROR', upsertError.message))
    }

    try {
      await triggerOrSkip({
        symptom_intake_id: upserted?.symptom_intake_id,
        appointment_id: input.appointment_id,
        patient_id: input.patient_id,
        symptoms: symptomsText,
        severity: input.severity,
        duration_text: input.duration_text,
        worsening: input.worsening,
        additional_context: input.additional_context ?? null,
        ai_processing_consent: input.ai_processing_consent,
      })
    } catch {
    }

    const result = {
      ...upserted,
      symptoms: upserted?.symptoms ? upserted.symptoms.split(', ').map((s: string) => s.trim()).filter(Boolean) : [],
    }

    return ok(result, 201)
  } catch (e: any) {
    return err(makeApptError('INTERNAL_ERROR', e?.message ?? 'Internal error'))
  }
}

export async function GET() {
  const identity = await resolveIdentity()
  if ('code' in identity) return err(identity)
  const deny = requireRoles(identity, ['Admin', 'Doctor', 'Patient'])
  if (deny) return err(deny)

  const supabase = (await createClient()) as any

  try {
    let query = supabase.from('symptom_intakes').select('*')

    if (identity.role === 'Patient' && identity.patientId) {
      query = query.eq('patient_id', identity.patientId)
    }
    if (identity.role === 'Doctor' && identity.staffId) {
      query = query
        .eq('appointments.doctor_id', identity.staffId)
        .select('*, appointments!inner(doctor_id)')
    }

    const { data, error } = await query.order('created_at', { ascending: false }).limit(500)

    if (error) {
      if (identity.role === 'Doctor') {
        const { data: rawData, error: rawError } = await supabase
          .from('symptom_intakes')
          .select('*, appointments!inner(doctor_id)')
          .eq('appointments.doctor_id', identity.staffId)
          .order('symptom_intakes.created_at', { ascending: false })
          .limit(500)

        if (rawError) return err(makeApptError('INTERNAL_ERROR', rawError.message))

        const cleaned = (rawData ?? []).map((row: any) => {
          const { appointments, ...rest } = row
          return {
            ...rest,
            symptoms: rest.symptoms ? rest.symptoms.split(', ').map((s: string) => s.trim()).filter(Boolean) : [],
          }
        })
        return ok({ intakes: cleaned })
      }
      return err(makeApptError('INTERNAL_ERROR', error.message))
    }

    const cleaned = (data ?? []).map((row: any) => ({
      ...row,
      symptoms: row.symptoms ? row.symptoms.split(', ').map((s: string) => s.trim()).filter(Boolean) : [],
    }))

    return ok({ intakes: cleaned })
  } catch (e: any) {
    return err(makeApptError('INTERNAL_ERROR', e?.message ?? 'Internal error'))
  }
}
