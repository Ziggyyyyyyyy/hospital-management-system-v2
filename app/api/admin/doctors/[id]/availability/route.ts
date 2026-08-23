import {
  resolveIdentity,
  requireRoles,
  ok,
  err,
} from '@/lib/appointments/api-helpers'
import { makeApptError } from '@/lib/appointments/error-codes'
import {
  CreateAvailabilitySchema,
  UpdateAvailabilitySchema,
} from '@/lib/validation/appointment'
import {
  createDoctorAvailability,
  deleteDoctorAvailability,
  updateDoctorAvailability,
} from '@/lib/appointments/availability-service'

// POST /api/admin/doctors/[id]/availability
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
  if (!Number.isFinite(doctorId)) {
    return err(makeApptError('VALIDATION_ERROR', 'Invalid doctor id'))
  }
  if (identity.role === 'Doctor' && identity.staffId !== doctorId) {
    return err(makeApptError('FORBIDDEN', 'Not allowed to set other doctor availability'))
  }
  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return err(makeApptError('VALIDATION_ERROR', 'Invalid JSON'))
  }
  const parsed = CreateAvailabilitySchema.safeParse(raw)
  if (!parsed.success) {
    return err(makeApptError('VALIDATION_ERROR', parsed.error.message))
  }
  try {
    const row = await createDoctorAvailability(doctorId, parsed.data)
    return ok(row, 201)
  } catch (e: any) {
    return err(makeApptError('INTERNAL_ERROR', e?.message ?? 'Failed'))
  }
}
