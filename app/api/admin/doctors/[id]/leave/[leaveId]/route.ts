import {
  resolveIdentity,
  requireRoles,
  ok,
  err,
} from '@/lib/appointments/api-helpers'
import { makeApptError } from '@/lib/appointments/error-codes'
import {
  deleteDoctorLeave,
  updateDoctorLeave,
} from '@/lib/appointments/leave-service'
import { UpdateLeaveSchema } from '@/lib/validation/appointment'

export async function PUT(
  req: Request,
  ctx: { params: Promise<{ id: string; leaveId: string }> },
) {
  const identity = await resolveIdentity()
  if ('code' in identity) return err(identity)
  const deny = requireRoles(identity, ['Admin', 'Doctor'])
  if (deny) return err(deny)
  const { id, leaveId } = await ctx.params
  const doctorId = Number(id)
  const leave_id = Number(leaveId)
  if (!Number.isFinite(doctorId) || !Number.isFinite(leave_id)) {
    return err(makeApptError('VALIDATION_ERROR', 'Invalid id'))
  }
  if (identity.role === 'Doctor' && identity.staffId !== doctorId) {
    return err(makeApptError('FORBIDDEN', 'Not allowed'))
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
  const res = await updateDoctorLeave(doctorId, leave_id, parsed.data)
  if ('code' in res) return err(res)
  return ok(res)
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string; leaveId: string }> },
) {
  const identity = await resolveIdentity()
  if ('code' in identity) return err(identity)
  const deny = requireRoles(identity, ['Admin', 'Doctor'])
  if (deny) return err(deny)
  const { id, leaveId } = await ctx.params
  const doctorId = Number(id)
  const leave_id = Number(leaveId)
  if (!Number.isFinite(doctorId) || !Number.isFinite(leave_id)) {
    return err(makeApptError('VALIDATION_ERROR', 'Invalid id'))
  }
  if (identity.role === 'Doctor' && identity.staffId !== doctorId) {
    return err(makeApptError('FORBIDDEN', 'Not allowed'))
  }
  const ok_del = await deleteDoctorLeave(doctorId, leave_id)
  if (!ok_del) return err(makeApptError('INTERNAL_ERROR', 'Delete failed'))
  return ok({ deleted: true })
}
