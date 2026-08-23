import { createServiceClient } from '../../utils/supabase/service'
import {
  fireNotification,
  buildBookingConfirmation,
  buildAppointmentCancellation,
  buildAppointmentReschedule,
  buildAppointmentReminder,
  buildDoctorLeaveConflict,
  buildDedupeKey,
  type NotificationType,
} from '../notifications/notification-service'
import {
  fireCalendarCreate,
  fireCalendarUpdate,
  fireCalendarDelete,
  type CalendarEventInput,
  type AppointmentForCalendar,
} from '../calendar/google-calendar-service'

export interface AppointmentEventContext {
  appointment_id: number
  patient_id: number
  doctor_id: number
  user_id: string | null
  patient_email: string
  doctor_email: string
  patient_name: string
  doctor_name: string
  department: string | null
  start_time: string
  end_time: string
  timezone: string
  reason_for_visit: string | null
}

async function fetchAppointmentContext(
  appointment_id: number,
): Promise<AppointmentEventContext | null> {
  try {
    const supabase = createServiceClient()
    const { data } = await supabase
      .from('appointments')
      .select(
        `
        appointment_id,
        patient_id,
        doctor_id,
        reason_for_visit,
        timezone,
        patients!inner (
          email,
          first_name,
          last_name,
          user_id
        ),
        medical_staff!appointments_doctor_id_fkey (
          first_name,
          last_name,
          email,
          departments ( name )
        ),
        appointment_slots!left ( start_time, end_time )
      `,
      )
      .eq('appointment_id', appointment_id)
      .maybeSingle()
    if (!data) return null
    const row = data as Record<string, unknown>
    const p = row.patients as Record<string, unknown> | undefined
    const d = row.medical_staff as Record<string, unknown> | undefined
    const slot = row.appointment_slots as Record<string, unknown> | undefined
    if (!p || !d) return null
    const pEmail = p.email as string | undefined
    const dEmail = d.email as string | undefined
    if (!pEmail || !dEmail) return null

    const patient_name = [p.first_name, p.last_name].filter(Boolean).join(' ') || 'Patient'
    const doctor_name = [d.first_name, d.last_name].filter(Boolean).join(' ') || 'Doctor'
    const depts = d.departments as Array<{ name: string }> | undefined
    const department = depts?.[0]?.name ?? null

    const startTime = slot?.start_time ? String(slot.start_time) : new Date().toISOString()
    const endTime = slot?.end_time
      ? String(slot.end_time)
      : new Date(Date.now() + 30 * 60 * 1000).toISOString()

    return {
      appointment_id: Number(row.appointment_id),
      patient_id: Number(row.patient_id),
      doctor_id: Number(row.doctor_id),
      user_id: (p.user_id as string) ?? null,
      patient_email: pEmail,
      doctor_email: dEmail,
      patient_name,
      doctor_name,
      department,
      start_time: startTime,
      end_time: endTime,
      timezone: (row.timezone as string) ?? 'UTC',
      reason_for_visit: (row.reason_for_visit as string) ?? null,
    }
  } catch {
    return null
  }
}

function toCalendarInput(ctx: AppointmentEventContext): CalendarEventInput {
  const appointment: AppointmentForCalendar = {
    appointment_id: ctx.appointment_id,
    patient_id: ctx.patient_id,
    doctor_id: ctx.doctor_id,
    reason_for_visit: ctx.reason_for_visit,
    start_time: ctx.start_time,
    end_time: ctx.end_time,
    timezone: ctx.timezone,
  }
  return {
    appointment,
    patient_email: ctx.patient_email,
    doctor_email: ctx.doctor_email,
    patient_name: ctx.patient_name,
    doctor_name: ctx.doctor_name,
    department: ctx.department ?? undefined,
  }
}

async function fireTypedNotification(
  ctx: AppointmentEventContext,
  type: Extract<
    NotificationType,
    'BOOKING_CONFIRMATION' | 'APPOINTMENT_CANCELLATION' | 'APPOINTMENT_RESCHEDULE'
  >,
  extraVars?: Record<string, unknown>,
): Promise<void> {
  try {
    let subject: string
    let body: string
    switch (type) {
      case 'BOOKING_CONFIRMATION': {
        const t = buildBookingConfirmation({
          appointment_id: ctx.appointment_id,
          patient_name: ctx.patient_name,
          doctor_name: ctx.doctor_name,
          department: ctx.department ?? undefined,
          start_time: ctx.start_time,
          reason_for_visit: ctx.reason_for_visit,
        })
        subject = t.subject
        body = t.body
        break
      }
      case 'APPOINTMENT_CANCELLATION': {
        const t = buildAppointmentCancellation({
          appointment_id: ctx.appointment_id,
          patient_name: ctx.patient_name,
          doctor_name: ctx.doctor_name,
          start_time: ctx.start_time,
          cancel_reason: (extraVars?.cancel_reason as string) ?? null,
          cancel_reason_text: (extraVars?.cancel_reason_text as string) ?? null,
        })
        subject = t.subject
        body = t.body
        break
      }
      case 'APPOINTMENT_RESCHEDULE': {
        const t = buildAppointmentReschedule({
          appointment_id: ctx.appointment_id,
          previous_appointment_id: (extraVars?.previous_appointment_id as number | string) ?? undefined,
          patient_name: ctx.patient_name,
          doctor_name: ctx.doctor_name,
          new_start_time: ctx.start_time,
          old_start_time: (extraVars?.old_start_time as string | Date) ?? undefined,
        })
        subject = t.subject
        body = t.body
        break
      }
    }
    fireNotification({
      type,
      channel: 'EMAIL',
      recipient: ctx.patient_email,
      subject,
      body,
      user_id: ctx.user_id,
      patient_id: ctx.patient_id,
      staff_id: ctx.doctor_id,
      appointment_id: ctx.appointment_id,
      dedupe_key: buildDedupeKey([type, ctx.appointment_id, 'EMAIL']),
    })
  } catch {
    // never propagate
  }
}

export async function outboxBookingConfirmed(appointment_id: number): Promise<void> {
  try {
    const ctx = await fetchAppointmentContext(appointment_id)
    if (!ctx) return
    void fireTypedNotification(ctx, 'BOOKING_CONFIRMATION')
    void fireCalendarCreate(toCalendarInput(ctx))
  } catch {
    // swallow all outbox errors
  }
}

export async function outboxAppointmentCancelled(
  appointment_id: number,
  opts?: { cancel_reason?: string; cancel_reason_text?: string },
): Promise<void> {
  try {
    const ctx = await fetchAppointmentContext(appointment_id)
    if (!ctx) return
    void fireTypedNotification(ctx, 'APPOINTMENT_CANCELLATION', {
      cancel_reason: opts?.cancel_reason,
      cancel_reason_text: opts?.cancel_reason_text,
    })
    void fireCalendarDelete({ appointment_id, doctor_id: ctx.doctor_id })
  } catch {
    // swallow
  }
}

export async function outboxAppointmentRescheduled(
  new_appointment_id: number,
  opts?: { previous_appointment_id?: number; old_start_time?: string | Date; previous_doctor_id?: number },
): Promise<void> {
  try {
    const ctx = await fetchAppointmentContext(new_appointment_id)
    if (!ctx) return
    void fireTypedNotification(ctx, 'APPOINTMENT_RESCHEDULE', {
      previous_appointment_id: opts?.previous_appointment_id,
      old_start_time: opts?.old_start_time,
    })
    // For reschedule: cancel calendar event on old appt, create new.
    if (opts?.previous_appointment_id) {
      void fireCalendarDelete({
        appointment_id: opts.previous_appointment_id,
        doctor_id: opts.previous_doctor_id ?? ctx.doctor_id,
      })
    }
    void fireCalendarCreate(toCalendarInput(ctx))
  } catch {
    // swallow
  }
}

export async function outboxLeaveConflictForAppointment(
  appointment_id: number,
  leave: { start_date: string | Date; end_date: string | Date; reason?: string | null },
): Promise<void> {
  try {
    const ctx = await fetchAppointmentContext(appointment_id)
    if (!ctx) return
    const { subject, body } = buildDoctorLeaveConflict({
      appointment_id: ctx.appointment_id,
      patient_name: ctx.patient_name,
      doctor_name: ctx.doctor_name,
      original_start_time: ctx.start_time,
      leave_start_date: leave.start_date,
      leave_end_date: leave.end_date,
      leave_reason: leave.reason ?? null,
    })
    fireNotification({
      type: 'DOCTOR_LEAVE_CONFLICT',
      channel: 'EMAIL',
      recipient: ctx.patient_email,
      subject,
      body,
      user_id: ctx.user_id,
      patient_id: ctx.patient_id,
      staff_id: ctx.doctor_id,
      appointment_id: ctx.appointment_id,
      dedupe_key: buildDedupeKey([
        'DOCTOR_LEAVE_CONFLICT',
        ctx.appointment_id,
        'EMAIL',
        String(leave.start_date),
        String(leave.end_date),
      ]),
    })
  } catch {
    // swallow
  }
}

export async function outboxAppointmentReminder(
  appointment_id: number,
  opts?: { day_bucket?: string },
): Promise<void> {
  try {
    const ctx = await fetchAppointmentContext(appointment_id)
    if (!ctx) return
    const bucket = opts?.day_bucket ?? new Date().toISOString().slice(0, 10)
    const { subject, body } = buildAppointmentReminder({
      appointment_id: ctx.appointment_id,
      patient_name: ctx.patient_name,
      doctor_name: ctx.doctor_name,
      department: ctx.department ?? undefined,
      start_time: ctx.start_time,
      reason_for_visit: ctx.reason_for_visit,
    })
    fireNotification({
      type: 'APPOINTMENT_REMINDER',
      channel: 'EMAIL',
      recipient: ctx.patient_email,
      subject,
      body,
      user_id: ctx.user_id,
      patient_id: ctx.patient_id,
      staff_id: ctx.doctor_id,
      appointment_id: ctx.appointment_id,
      dedupe_key: buildDedupeKey(['APPOINTMENT_REMINDER', ctx.appointment_id, bucket, 'EMAIL']),
    })
  } catch {
    // swallow
  }
}

export async function sendDueAppointmentReminders(
  opts?: {
    hours_before?: number
    limit?: number
  },
): Promise<{ sent: number; errors: number }> {
  const hoursBefore = opts?.hours_before ?? 24
  const limit = opts?.limit ?? 500
  let sent = 0
  let errors = 0
  try {
    const supabase = createServiceClient()
    const now = new Date()
    const windowStart = new Date(now.getTime() + hoursBefore * 60 * 60 * 1000 - 60 * 60 * 1000)
    const windowEnd = new Date(now.getTime() + hoursBefore * 60 * 60 * 1000 + 60 * 60 * 1000)
    const { data, error } = await supabase
      .from('appointments')
      .select('appointment_id, appointment_slots(start_time)')
      .eq('status', 'CONFIRMED')
      .gte('appointment_slots.start_time', windowStart.toISOString())
      .lte('appointment_slots.start_time', windowEnd.toISOString())
      .limit(limit)

    if (error) {
      errors++
      return { sent, errors }
    }
    const rows = (data ?? []) as Array<{ appointment_id: number }>
    const dayBucket = windowStart.toISOString().slice(0, 10)
    for (const r of rows) {
      try {
        await outboxAppointmentReminder(r.appointment_id, { day_bucket: dayBucket })
        sent++
      } catch {
        errors++
      }
    }
    return { sent, errors }
  } catch {
    return { sent, errors: errors + 1 }
  }
}
