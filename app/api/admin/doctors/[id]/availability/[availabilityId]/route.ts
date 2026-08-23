import {
  resolveIdentity,
  requireRoles,
  ok,
  err,
} from '@/lib/appointments/api-helpers'
import { makeApptError } from '@/lib/appointments/error-codes'
import { UpdateAvailabilitySchema } from '@/lib/validation/appointment'
import {
  updateDoctorAvailability,
  deleteDoctorAvailability,
} from '@/lib/appointments/availability-service'

export async function PUT(
  req: Request,
  ctx: { params: Promise<{ id: string; availabilityId: string }> },
) {
  const identity = await resolveIdentity()
  if ('code' in identity) return err(identity)
  const deny = requireRoles(identity, ['Admin', 'Doctor'])
  if (deny) return err(deny)
  const { id, availabilityId } = await ctx.params
  const doctorId = Number(id)
  const availId = Number(availabilityId)
  if (!Number.isFinite(doctorId) || !Number.isFinite(availId)) {
    return err(makeApptError('VALIDATION_ERROR', 'Invalid id'))
  }
  if (identity.role === 'Doctor' && identity.staffId !== doctorId) {
    return err(makeApptError('FORBIDDEN', 'Not allowed to update other doctor availability'))
  }
  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return err(makeApptError('VALIDATION_ERROR', 'Invalid JSON'))
  }
  const parsed = UpdateAvailabilitySchema.safeParse(raw)
  if (!parsed.success) {
    return err(makeApptError('VALIDATION_ERROR', parsed.error.message))
  }
  try {
    const row = await updateDoctorAvailability(doctorId, availId, parsed.data)
    return ok(row)
  } catch (e: any) {
    return err(makeApptError('INTERNAL_ERROR', e?.message ?? 'Failed'))
  }
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string; availabilityId: string }> },
) {
  const identity = await resolveIdentity()
  if ('code' in identity) return err(identity)
  const deny = requireRoles(identity, ['Admin', 'Doctor'])
  if (deny) return err(deny)
  const { id, availabilityId } = await ctx.params
  const doctorId = Number(id)
  const availId = Number(availabilityId)
  if (!Number.isFinite(doctorId) || !Number.isFinite(availId)) {
    return err(makeApptError('VALIDATION_ERROR', 'Invalid id'))
  }
  if (identity.role === 'Doctor' && identity.staffId !== doctorId) {
    return err(makeApptError('FORBIDDEN', 'Not allowed'))
  }
  const ok_del = await deleteDoctorAvailability(doctorId, availId)
  if (!ok_del) return err(makeApptError('INTERNAL_ERROR', 'Deletion failed'))
  return ok({ deleted: true })
}
