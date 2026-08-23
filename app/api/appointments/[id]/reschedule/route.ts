import {
  resolveIdentity,
  requireRoles,
  ok,
  err,
} from '@/lib/appointments/api-helpers'
import { makeApptError } from '@/lib/appointments/error-codes'
import { RescheduleAppointmentInputSchema } from '@/lib/validation/appointment'
import { rescheduleAppointment } from '@/lib/appointments/booking-service'
import { outboxAppointmentRescheduled } from '@/lib/appointments/event-outbox'
import crypto from 'node:crypto'

/**
 * POST /api/appointments/[id]/reschedule
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const identity = await resolveIdentity()
  if ('code' in identity) return err(identity)
  const deny = requireRoles(identity, ['Admin', 'Doctor', 'Patient'])
  if (deny) return err(deny)
  if (identity.role === 'Patient' && !identity.patientId) {
    return err(makeApptError('FORBIDDEN', 'Patient profile missing'))
  }

  const { id } = await ctx.params
  const apptId = Number(id)
  if (!Number.isFinite(apptId) || apptId <= 0) {
    return err(makeApptError('VALIDATION_ERROR', 'Invalid appointment id'))
  }

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return err(makeApptError('VALIDATION_ERROR', 'Invalid JSON body'))
  }
  const parsed = RescheduleAppointmentInputSchema.safeParse(raw)
  if (!parsed.success) {
    return err(makeApptError('VALIDATION_ERROR', parsed.error.message))
  }

  const idempotencyKey = crypto
    .createHash('sha256')
    .update(`${apptId}|${parsed.data.new_hold_token}|${parsed.data.new_slot_id}|reschedule`)
    .digest('hex')
    .slice(0, 64)

  const res = await rescheduleAppointment({
    existing_appointment_id: apptId,
    patient_id: identity.patientId ?? 0,
    caller_user_id: identity.userId,
    new_hold_token: parsed.data.new_hold_token,
    new_slot_id: Number(parsed.data.new_slot_id),
    reason_for_visit: parsed.data.reason_for_visit,
    idempotency_key: idempotencyKey,
  })
  if ('code' in res) return err(res)
  void outboxAppointmentRescheduled(
    Number((res as { appointment?: { appointment_id?: number } }).appointment?.appointment_id ?? 0),
    {
      previous_appointment_id: apptId,
      previous_doctor_id:
        Number(
          (res as { appointment?: { doctor_id?: number } }).appointment?.doctor_id ?? 0,
        ) || undefined,
    },
  ).catch(() => {})
  return ok(res)
}
