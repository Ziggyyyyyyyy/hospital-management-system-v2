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
  listDoctorAvailability,
  createDoctorAvailability,
} from '@/lib/appointments/availability-service'
import { CreateAvailabilitySchema } from '@/lib/validation/appointment'

/**
 * GET /api/doctors/[id]/availability
 */
export async function GET(
  _req: Request,
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

  try {
    const supabase = createServiceClient()
    const all = await listDoctorAvailability(doctorId, supabase as any)
    const filtered =
      identity.role === 'Admin' ||
      (identity.role === 'Doctor' && identity.staffId === doctorId)
        ? all
        : all.filter((a) => a.active)
    return ok(filtered)
  } catch (e: any) {
    return err(makeApptError('INTERNAL_ERROR', e?.message ?? 'Failed'))
  }
}

/**
 * POST /api/doctors/[id]/availability
 * Doctor or Admin can set/update availability and trigger slot generation.
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const identity = await resolveIdentity()
  if ('code' in identity) return err(identity)
  const deny = requireRoles(identity, ['Admin', 'Doctor'])
  if (deny) return err(deny)

  const { id } = await ctx.params
  const doctorId = Number(id)
  if (!Number.isFinite(doctorId) || doctorId <= 0) {
    return err(makeApptError('VALIDATION_ERROR', 'Invalid doctor id'))
  }

  if (identity.role === 'Doctor' && identity.staffId !== doctorId) {
    return err(
      makeApptError('FORBIDDEN', 'Cannot modify another doctor availability'),
    )
  }

  try {
    const body = await req.json()
    const parsed = CreateAvailabilitySchema.safeParse(body)
    if (!parsed.success) {
      return err(makeApptError('VALIDATION_ERROR', parsed.error.message))
    }

    const created = await createDoctorAvailability(doctorId, parsed.data)

    // Trigger slot generation for next 30 days
    const serviceSupabase = createServiceClient()
    const fromDate = new Date().toISOString().slice(0, 10)
    const toDate = new Date(Date.now() + 30 * 86400000)
      .toISOString()
      .slice(0, 10)

    await serviceSupabase.rpc('generate_doctor_slots', {
      p_doctor_id: doctorId,
      p_from_date: fromDate,
      p_to_date: toDate,
      p_force_rebuild: false,
    })

    return ok(created, 201)
  } catch (e: any) {
    return err(makeApptError('INTERNAL_ERROR', e?.message ?? 'Failed'))
  }
}
