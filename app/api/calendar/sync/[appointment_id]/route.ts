import { createServiceClient } from '@/utils/supabase/service'
import {
  resolveIdentity,
  requireRoles,
  ok,
  err,
} from '@/lib/appointments/api-helpers'
import { makeApptError } from '@/lib/appointments/error-codes'
import {
  createEvent,
  updateEvent,
} from '@/lib/calendar/google-calendar-service'
import type {
  CalendarEventInput,
  AppointmentForCalendar,
  CalendarOpResult,
} from '@/lib/calendar/google-calendar-service'

async function buildCalendarInput(
  appointment_id: number,
): Promise<CalendarEventInput | null> {
  const supabase = createServiceClient()
  const { data: appt } = await supabase
    .from('appointments')
    .select(
      `
      appointment_id,
      patient_id,
      doctor_id,
      reason_for_visit,
      timezone,
      patients!inner (
        patient_id,
        email,
        first_name,
        last_name
      ),
      medical_staff!appointments_doctor_id_fkey (
        staff_id,
        first_name,
        last_name,
        email,
        departments (
          name
        )
      ),
      appointment_slots!left (
        start_time,
        end_time
      )
    `,
    )
    .eq('appointment_id', appointment_id)
    .maybeSingle()

  if (!appt) return null

  const row = appt as Record<string, unknown>
  const patient = row.patients as Record<string, unknown> | undefined
  const doctor = row.medical_staff as Record<string, unknown> | undefined
  const slot = row.appointment_slots as Record<string, unknown> | undefined

  if (!patient || !doctor) return null

  const patientEmail = patient.email as string | undefined
  const doctorEmail = doctor.email as string | undefined
  if (!patientEmail || !doctorEmail) return null

  const startTime = slot?.start_time
    ? String(slot.start_time)
    : new Date().toISOString()
  const endTime = slot?.end_time
    ? String(slot.end_time)
    : new Date(Date.now() + 30 * 60 * 1000).toISOString()

  const appointment: AppointmentForCalendar = {
    appointment_id: Number(row.appointment_id),
    patient_id: Number(row.patient_id),
    doctor_id: Number(row.doctor_id),
    reason_for_visit: (row.reason_for_visit as string) ?? null,
    start_time: startTime,
    end_time: endTime,
    timezone: (row.timezone as string) ?? 'UTC',
  }

  const patientName =
    [patient.first_name, patient.last_name].filter(Boolean).join(' ') ||
    undefined
  const doctorName =
    [doctor.first_name, doctor.last_name].filter(Boolean).join(' ') ||
    undefined

  const departments = doctor.departments as
    | Array<{ name: string }>
    | undefined
  const department = departments?.[0]?.name

  return {
    appointment,
    patient_email: patientEmail,
    doctor_email: doctorEmail,
    patient_name: patientName,
    doctor_name: doctorName,
    department,
  }
}

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ appointment_id: string }> },
) {
  const identity = await resolveIdentity()
  if ('code' in identity) return err(identity)
  const deny = requireRoles(identity, ['Admin', 'Doctor', 'Nurse'])
  if (deny) return err(deny)

  const { appointment_id: apptIdRaw } = await ctx.params
  const appointmentId = Number(apptIdRaw)
  if (!Number.isFinite(appointmentId) || appointmentId <= 0) {
    return err(makeApptError('VALIDATION_ERROR', 'Invalid appointment id'))
  }

  let input: CalendarEventInput | null = null
  try {
    input = await buildCalendarInput(appointmentId)
  } catch (e: any) {
    return ok({
      success: false,
      status: 'FAILED',
      error: e?.message ?? 'Failed to load appointment details',
    })
  }

  if (!input) {
    return ok({
      success: false,
      status: 'FAILED',
      error:
        'Could not build calendar event (missing appointment, emails, or slot data)',
    })
  }

  let result: CalendarOpResult = { status: 'FAILED', error: 'Sync not executed' }
  try {
    const supabase = createServiceClient()
    const { data: existing } = await supabase
      .from('calendar_events')
      .select('google_event_id')
      .eq('appointment_id', appointmentId)
      .maybeSingle()

    const hasExistingGoogleId =
      !!existing &&
      (existing as Record<string, unknown>).google_event_id !== null &&
      (existing as Record<string, unknown>).google_event_id !== undefined

    if (hasExistingGoogleId) {
      result = await updateEvent(input)
    } else {
      result = await createEvent(input)
    }
  } catch (e: any) {
    try {
      result = await createEvent(input)
    } catch (e2: any) {
      result = {
        status: 'FAILED',
        error: e2?.message ?? e?.message ?? 'Calendar sync threw an exception',
      }
    }
  }

  const wasSuccess =
    result.status === 'SYNCED' ||
    result.status === 'UPDATED' ||
    result.status === 'CANCELLED'

  return ok({
    success: wasSuccess,
    status: result.status,
    google_event_id: result.google_event_id ?? null,
    error: result.error ?? null,
  })
}
