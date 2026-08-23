import {
  resolveIdentity,
  requireRoles,
  ok,
  err,
} from '@/lib/appointments/api-helpers'
import { makeApptError } from '@/lib/appointments/error-codes'
import { CancelAppointmentInputSchema } from '@/lib/validation/appointment'
import { cancelAppointment as cancelService } from '@/lib/appointments/booking-service'
import { outboxAppointmentCancelled } from '@/lib/appointments/event-outbox'

/**
 * POST /api/appointments/[id]/cancel
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const identity = await resolveIdentity()
  if ('code' in identity) return err(identity)
  const deny = requireRoles(identity, ['Admin', 'Doctor', 'Patient'])
  if (deny) return err(deny)

  const { id } = await ctx.params
  const apptId = Number(id)
  if (!Number.isFinite(apptId) || apptId <= 0) {
    return err(makeApptError('VALIDATION_ERROR', 'Invalid appointment id'))
  }

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    raw = {}
  }
  const parsed = CancelAppointmentInputSchema.safeParse(raw)
  if (!parsed.success) {
    return err(makeApptError('VALIDATION_ERROR', parsed.error.message))
  }

  const allowedRole: 'Admin' | 'Doctor' | 'Patient' =
    identity.role === 'Admin' || identity.role === 'Doctor' || identity.role === 'Patient'
      ? identity.role
      : 'Patient'

  const result = await cancelService({
    appointment_id: apptId,
    patient_id: identity.role === 'Patient' ? identity.patientId ?? null : null,
    caller_user_id: identity.userId,
    caller_role: allowedRole,
    reason: parsed.data.reason,
    reason_text: parsed.data.reason_text,
  })
  if ('code' in result) return err(result)
  void outboxAppointmentCancelled(apptId, {
    cancel_reason: parsed.data.reason,
    cancel_reason_text: parsed.data.reason_text,
  }).catch(() => {})
  return ok(result)
}
