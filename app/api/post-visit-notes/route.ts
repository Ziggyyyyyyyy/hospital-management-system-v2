import { createClient } from '@/utils/supabase/server'
import { createServiceClient } from '@/utils/supabase/service'
import {
  resolveIdentity,
  requireRoles,
  ok,
  err,
  jsonWithCors,
} from '@/lib/appointments/api-helpers'
import { makeApptError } from '@/lib/appointments/error-codes'
import { PostVisitNoteSchema } from '@/lib/validation/appointment'
import { generatePostVisitSummary } from '@/lib/ai/postvisit-service'
import type { NextRequest } from 'next/server'

export async function POST(req: Request) {
  const identity = await resolveIdentity()
  if ('code' in identity) return err(identity)
  const deny = requireRoles(identity, ['Doctor'])
  if (deny) return err(deny)

  if (!identity.staffId) {
    return err(makeApptError('FORBIDDEN', 'Doctor profile missing'))
  }

  const body = (await req.json().catch(() => null)) as
    | {
        appointment_id?: unknown
        clinical_notes?: unknown
        diagnosis?: unknown
        follow_up_instr?: unknown
      }
    | null

  if (!body) {
    return err(makeApptError('VALIDATION_ERROR', 'Request body required'))
  }

  const rawApptId = Number(body.appointment_id)
  if (!Number.isFinite(rawApptId) || rawApptId <= 0) {
    return err(makeApptError('VALIDATION_ERROR', 'Invalid appointment_id'))
  }

  const serviceSupabase = createServiceClient()

  const { data: appt, error: apptErr } = await serviceSupabase
    .from('appointments')
    .select('appointment_id, patient_id, doctor_id, status')
    .eq('appointment_id', rawApptId)
    .maybeSingle()

  if (apptErr) {
    return err(makeApptError('INTERNAL_ERROR', apptErr.message))
  }
  if (!appt) {
    return err(makeApptError('APPOINTMENT_NOT_FOUND', 'Appointment not found'))
  }

  if (appt.doctor_id !== identity.staffId) {
    return err(makeApptError('FORBIDDEN', 'This appointment does not belong to you'))
  }

  const validation = PostVisitNoteSchema.safeParse({
    appointment_id: rawApptId,
    patient_id: appt.patient_id,
    doctor_id: appt.doctor_id,
    clinical_notes: body.clinical_notes,
    diagnosis: body.diagnosis,
    follow_up_instr: body.follow_up_instr,
  })

  if (!validation.success) {
    const issues = validation.error.issues
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('; ')
    return err(makeApptError('VALIDATION_ERROR', issues))
  }

  const noteData = validation.data

  const warnings: string[] = []

  try {
    const { data: existing, error: findErr } = await serviceSupabase
      .from('post_visit_notes')
      .select('note_id')
      .eq('appointment_id', rawApptId)
      .maybeSingle()

    if (findErr) throw findErr

    let noteId: number
    if (existing) {
      const { data: updated, error: updErr } = await serviceSupabase
        .from('post_visit_notes')
        .update({
          clinical_notes: noteData.clinical_notes,
          diagnosis: noteData.diagnosis ?? null,
          follow_up_instr: noteData.follow_up_instr ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq('note_id', existing.note_id)
        .select('note_id')
        .single()
      if (updErr) throw updErr
      noteId = Number(updated.note_id)
    } else {
      const { data: inserted, error: insErr } = await serviceSupabase
        .from('post_visit_notes')
        .insert({
          appointment_id: noteData.appointment_id,
          patient_id: noteData.patient_id,
          doctor_id: noteData.doctor_id,
          clinical_notes: noteData.clinical_notes,
          diagnosis: noteData.diagnosis ?? null,
          follow_up_instr: noteData.follow_up_instr ?? null,
          created_by: identity.userId,
        })
        .select('note_id')
        .single()
      if (insErr) throw insErr
      noteId = Number(inserted.note_id)
    }

    if (appt.status !== 'COMPLETED') {
      try {
        const { error: statusErr } = await serviceSupabase
          .from('appointments')
          .update({
            status: 'COMPLETED',
            completed_at: new Date().toISOString(),
          })
          .eq('appointment_id', rawApptId)
        if (statusErr) {
          warnings.push(
            `Could not mark appointment as COMPLETED: ${statusErr.message}`,
          )
        }
      } catch (statusThrowable: unknown) {
        const msg =
          statusThrowable instanceof Error
            ? statusThrowable.message
            : String(statusThrowable)
        warnings.push(`Could not mark appointment as COMPLETED: ${msg}`)
      }
    }

    setImmediate(async () => {
      try {
        await generatePostVisitSummary(noteId)
      } catch {
      }
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return err(makeApptError('INTERNAL_ERROR', msg))
  }

  return jsonWithCors(
    {
      success: true,
      data: {
        appointment_id: rawApptId,
        message: 'Post-visit note saved successfully',
      },
      ...(warnings.length > 0 ? { warnings } : {}),
    },
    { status: 201 },
  )
}

export async function GET(req: NextRequest) {
  const identity = await resolveIdentity()
  if ('code' in identity) return err(identity)
  const deny = requireRoles(identity, ['Admin', 'Doctor', 'Patient'])
  if (deny) return err(deny)

  const { searchParams } = new URL(req.url)
  const patientFilter = searchParams.get('patient_id')
  const doctorFilter = searchParams.get('doctor_id')

  const supabase = await createClient()
  const serviceSupabase = createServiceClient()

  try {
    let query = serviceSupabase
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

    if (identity.role === 'Patient') {
      if (!identity.patientId) {
        return err(makeApptError('FORBIDDEN', 'Patient profile missing'))
      }
      query = query.eq('patient_id', identity.patientId)
    } else if (identity.role === 'Doctor') {
      if (!identity.staffId) {
        return err(makeApptError('FORBIDDEN', 'Doctor profile missing'))
      }
      query = query.eq('doctor_id', identity.staffId)
    } else {
      if (patientFilter) {
        const pid = Number(patientFilter)
        if (Number.isFinite(pid) && pid > 0) query = query.eq('patient_id', pid)
      }
      if (doctorFilter) {
        const did = Number(doctorFilter)
        if (Number.isFinite(did) && did > 0) query = query.eq('doctor_id', did)
      }
    }

    query = query.order('created_at', { ascending: false }).limit(500)

    const { data, error } = await query

    if (error) {
      return err(makeApptError('INTERNAL_ERROR', error.message))
    }

    void supabase
    return ok({ notes: data ?? [] })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return err(makeApptError('INTERNAL_ERROR', msg))
  }
}
