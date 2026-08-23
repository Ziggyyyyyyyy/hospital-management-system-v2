import {
  resolveIdentity,
  requireRoles,
  ok,
  err,
} from '@/lib/appointments/api-helpers'
import { makeApptError } from '@/lib/appointments/error-codes'
import { ConfirmBookingInputSchema } from '@/lib/validation/appointment'
import { confirmBooking } from '@/lib/appointments/booking-service'
import { outboxBookingConfirmed } from '@/lib/appointments/event-outbox'
import crypto from 'node:crypto'

/**
 * POST /api/appointments/confirm
 * Body: { hold_token, reason_for_visit?, timezone?, idempotency_key? }
 */
export async function POST(req: Request) {
  const identity = await resolveIdentity()
  if ('code' in identity) return err(identity)
  const deny = requireRoles(identity, ['Patient'])
  if (deny) return err(deny)
  if (!identity.patientId) {
    return err(makeApptError('FORBIDDEN', 'Patient profile missing'))
  }
  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return err(makeApptError('VALIDATION_ERROR', 'Invalid JSON body'))
  }
  const parsed = ConfirmBookingInputSchema.safeParse(raw)
  if (!parsed.success) {
    return err(makeApptError('VALIDATION_ERROR', parsed.error.message))
  }
  const body = parsed.data

  // Server-generated deterministic idempotency key if client skipped
  const idempotencyKey =
    body.idempotency_key ??
    // deterministically combine hold_token (unique per hold) + patient_id
    crypto
      .createHash('sha256')
      .update(`${body.hold_token}|${identity.patientId}|confirm`)
      .digest('hex')
      .slice(0, 64)

  const result = await confirmBooking({
    hold_token: body.hold_token,
    reason_for_visit: body.reason_for_visit,
    timezone: body.timezone,
    idempotency_key: idempotencyKey,
    patient_id: identity.patientId,
    booked_by_user_id: identity.userId,
  })
  if ('code' in result) return err(result)
  void outboxBookingConfirmed(Number(result.appointment_id)).catch(() => {})
  return ok(result)
}
