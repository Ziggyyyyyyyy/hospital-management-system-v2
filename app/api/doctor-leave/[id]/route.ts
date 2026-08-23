import { createClient } from '@/utils/supabase/server'
import { createServiceClient } from '@/utils/supabase/service'
import {
  resolveIdentity,
  requireRoles,
  ok,
  err,
} from '@/lib/appointments/api-helpers'
import { makeApptError } from '@/lib/appointments/error-codes'
import {
  UpdateLeaveSchema,
} from '@/lib/validation/appointment'
import {
  updateDoctorLeave,
  processDoctorLeaveConflicts,
  type LeaveRow,
} from '@/lib/appointments/leave-service'
import { sendNotification } from '@/lib/notifications/notification-service'
import type { SendNotificationResult } from '@/lib/notifications/notification-service'

async function fireConflictNotifications(
  doctorId: number,
  start_date: string,
  end_date: string,
): Promise<SendNotificationResult[]> {
  const results: SendNotificationResult[] = []
  try {
    const supabase = createServiceClient()
    const { data: conflictedAppts } = await supabase
      .from('appointments')
      .select(
        `
        appointment_id,
        patient_id,
        doctor_id,
        status,
        patients!inner (
          patient_id,
          user_id,
          email,
          first_name,
          last_name
        ),
        appointment_slots!left (
          start_time,
          end_time
        )
      `,
      )
      .eq('doctor_id', doctorId)
      .eq('status', 'DOCTOR_LEAVE_CONFLICT')
      .gte('appointment_slots.start_time', `${start_date}T00:00:00Z`)
      .lte('appointment_slots.start_time', `${end_date}T23:59:59Z`)

    if (!conflictedAppts || conflictedAppts.length === 0) {
      return results
    }

    for (const appt of conflictedAppts as unknown as Array<{
      appointment_id: number
      patient_id: number
      doctor_id: number
      status: string
      patients: {
        patient_id: number
        user_id: string | null
        email: string | null
        first_name: string | null
        last_name: string | null
      }
      appointment_slots: {
        start_time: string | null
        end_time: string | null
      } | null
    }>) {
      try {
        const patient = appt.patients
        const recipient = patient.email
        if (!recipient) continue

        const patientName =
          [patient.first_name, patient.last_name].filter(Boolean).join(' ') ||
          'Patient'
        const slotTime = appt.appointment_slots?.start_time
          ? new Date(appt.appointment_slots.start_time).toLocaleString()
          : 'scheduled'

        const subject = `Action Required: Your Appointment on ${slotTime} is Affected by Doctor Leave`
        const bodyLines = [
          `Dear ${patientName},`,
          '',
          `We are writing to inform you that your appointment (#${appt.appointment_id}) scheduled for ${slotTime} has been affected because your doctor is on leave.`,
          '',
          'Please log in to your account to reschedule or cancel this appointment.',
          '',
          'We apologize for any inconvenience this may cause.',
          '',
          'Best regards,',
          'Hospital Management Team',
        ]

        const result = await sendNotification({
          user_id: patient.user_id ?? null,
          patient_id: appt.patient_id,
          appointment_id: appt.appointment_id,
          type: 'DOCTOR_LEAVE_CONFLICT',
          channel: 'EMAIL',
          recipient,
          subject,
          body: bodyLines.join('\n'),
          template_vars: {
            appointment_id: appt.appointment_id,
            patient_name: patientName,
            slot_time: slotTime,
          },
        })
        results.push(result)
      } catch {
        // swallow individual notification errors
      }
    }
  } catch {
    // swallow top-level notification dispatch errors
  }
  return results
}

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const identity = await resolveIdentity()
  if ('code' in identity) return err(identity)
  const deny = requireRoles(identity, ['Admin', 'Doctor'])
  if (deny) return err(deny)

  const { id } = await ctx.params
  const leaveId = Number(id)
  if (!Number.isFinite(leaveId) || leaveId <= 0) {
    return err(makeApptError('VALIDATION_ERROR', 'Invalid leave id'))
  }

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return err(makeApptError('VALIDATION_ERROR', 'Invalid JSON'))
  }
  const parsed = UpdateLeaveSchema.safeParse(raw)
  if (!parsed.success) {
    return err(makeApptError('VALIDATION_ERROR', parsed.error.message))
  }

  const supabase = createServiceClient()

  const { data: existingLeave, error: fetchErr } = await supabase
    .from('doctor_leave')
    .select('*')
    .eq('leave_id', leaveId)
    .maybeSingle()

  if (fetchErr) {
    return err(makeApptError('INTERNAL_ERROR', fetchErr.message))
  }
  if (!existingLeave) {
    return err(makeApptError('APPOINTMENT_NOT_FOUND', 'Leave record not found'))
  }
  const existing = existingLeave as LeaveRow

  if (identity.role === 'Doctor') {
    if (!identity.staffId) {
      return err(makeApptError('FORBIDDEN', 'Doctor profile missing'))
    }
    if (identity.staffId !== existing.doctor_id) {
      return err(makeApptError('FORBIDDEN', 'Not allowed to update this leave'))
    }
  }

  const doctorId = existing.doctor_id
  const previousStatus = existing.status
  const patch = parsed.data

  const effectiveStart = patch.start_date ?? existing.start_date
  const effectiveEnd = patch.end_date ?? existing.end_date

  const updateResult = await updateDoctorLeave(doctorId, leaveId, patch)
  if ('code' in updateResult) return err(updateResult)

  const newStatus = patch.status ?? previousStatus
  const statusBecameActive =
    (newStatus === 'APPROVED' || newStatus === 'PENDING') &&
    previousStatus !== 'APPROVED' &&
    previousStatus !== 'PENDING'

  if (statusBecameActive) {
    try {
      await processDoctorLeaveConflicts(
        doctorId,
        effectiveStart,
        effectiveEnd,
      )
    } catch {
      // swallow conflict RPC errors — leave record is already persisted
    }

    try {
      await fireConflictNotifications(doctorId, effectiveStart, effectiveEnd)
    } catch {
      // swallow notification errors entirely
    }
  }

  return ok(updateResult)
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const identity = await resolveIdentity()
  if ('code' in identity) return err(identity)
  const deny = requireRoles(identity, ['Admin', 'Doctor'])
  if (deny) return err(deny)

  const { id } = await ctx.params
  const leaveId = Number(id)
  if (!Number.isFinite(leaveId) || leaveId <= 0) {
    return err(makeApptError('VALIDATION_ERROR', 'Invalid leave id'))
  }

  const supabase = (await createClient()) as any
  try {
    const { data, error } = await supabase
      .from('doctor_leave')
      .select('*')
      .eq('leave_id', leaveId)
      .maybeSingle()

    if (error) return err(makeApptError('INTERNAL_ERROR', error.message))
    if (!data) {
      return err(makeApptError('APPOINTMENT_NOT_FOUND', 'Leave record not found'))
    }

    const row = data as LeaveRow
    if (identity.role === 'Doctor') {
      if (!identity.staffId) {
        return err(makeApptError('FORBIDDEN', 'Doctor profile missing'))
      }
      if (identity.staffId !== row.doctor_id) {
        return err(makeApptError('FORBIDDEN', 'Not allowed'))
      }
    }

    return ok(row)
  } catch (e: any) {
    return err(makeApptError('INTERNAL_ERROR', e?.message ?? 'Internal error'))
  }
}
