import { createClient } from '@/utils/supabase/server'
import {
  resolveIdentity,
  requireRoles,
  ok,
  err,
} from '@/lib/appointments/api-helpers'
import { makeApptError } from '@/lib/appointments/error-codes'
import {
  generateSlotsForDoctor,
  getDefaultDateRange,
  listSlots,
} from '@/lib/appointments/slot-generator'
import { SlotQuerySchema } from '@/lib/validation/appointment'

/**
 * GET /api/doctors/[id]/slots?date_from=YYYY-MM-DD&date_to=YYYY-MM-DD&status=...
 *
 * If no slots exist in the range and generation is possible, generate them
 * on-demand so the patient flow works immediately.
 */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const identity = await resolveIdentity()
  if ('code' in identity) return err(identity)
  const deny = requireRoles(identity, ['Admin', 'Doctor', 'Nurse', 'Patient'])
  if (deny) return err(deny)

  const { id } = await ctx.params
  const doctorId = Number(id)
  if (!Number.isFinite(doctorId) || doctorId <= 0) {
    return err(makeApptError('VALIDATION_ERROR', 'Invalid doctor id'))
  }
  const url = new URL(req.url)
  const parsed = SlotQuerySchema.safeParse({
    date_from: url.searchParams.get('date_from') ?? undefined,
    date_to: url.searchParams.get('date_to') ?? undefined,
    status: url.searchParams.get('status') ?? undefined,
  })
  if (!parsed.success) {
    return err(makeApptError('VALIDATION_ERROR', parsed.error.message))
  }
  const q = parsed.data
  const range = {
    date_from: q.date_from ?? getDefaultDateRange().from_date,
    date_to: q.date_to ?? getDefaultDateRange().to_date,
  }
  if (new Date(range.date_from) > new Date(range.date_to)) {
    return err(makeApptError('INVALID_DATE_RANGE', 'date_from > date_to'))
  }

  const supabase = await createClient()

  // Try to list. If none, generate on-demand (best-effort idempotent)
  let slots = await listSlots(doctorId, { ...range, status: q.status }, supabase as any)
  if (slots.length === 0 && !q.status) {
    try {
      await generateSlotsForDoctor(
        doctorId,
        {
          from_date: range.date_from,
          to_date: range.date_to,
          force_rebuild: false,
        },
        supabase as any,
      )
      slots = await listSlots(doctorId, { ...range, status: q.status }, supabase as any)
    } catch (e: any) {
      return err(makeApptError('INTERNAL_ERROR', e?.message ?? 'Slot generation failed'))
    }
  }

  // Expire stale holds before returning so the list reflects reality.
  try {
    const { createServiceClient: svc } = require('@/utils/supabase/service')
    const { expireStaleHolds } = require('@/lib/appointments/hold-service')
    await expireStaleHolds(svc())
  } catch {
    // best-effort; failure is fine
  }

  return ok({
    doctor_id: doctorId,
    range,
    slots,
  })
}
