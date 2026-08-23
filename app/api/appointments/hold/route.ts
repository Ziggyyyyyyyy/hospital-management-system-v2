import {
  resolveIdentity,
  requireRoles,
  ok,
  err,
} from '@/lib/appointments/api-helpers'
import { makeApptError } from '@/lib/appointments/error-codes'
import { HoldSlotInputSchema } from '@/lib/validation/appointment'
import { acquireHold } from '@/lib/appointments/hold-service'

/**
 * POST /api/appointments/hold
 * Body: { slot_id, doctor_id }
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
  const parsed = HoldSlotInputSchema.safeParse(raw)
  if (!parsed.success) {
    return err(makeApptError('VALIDATION_ERROR', parsed.error.message))
  }
  const body = parsed.data
  const result = await acquireHold({
    doctor_id: Number(body.doctor_id),
    slot_id: Number(body.slot_id),
    patient_id: identity.patientId,
  })
  if ('code' in result) return err(result)
  return ok(result)
}
