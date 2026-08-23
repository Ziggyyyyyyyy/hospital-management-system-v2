import {
  resolveIdentity,
  requireRoles,
  ok,
  err,
} from '@/lib/appointments/api-helpers'
import { makeApptError } from '@/lib/appointments/error-codes'
import {
  CreateLeaveSchema,
  UpdateLeaveSchema,
} from '@/lib/validation/appointment'
import {
  createDoctorLeave,
  updateDoctorLeave,
  deleteDoctorLeave,
} from '@/lib/appointments/leave-service'

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
    return err(makeApptError('FORBIDDEN', 'Not allowed'))
  }
  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return err(makeApptError('VALIDATION_ERROR', 'Invalid JSON'))
  }
  const parsed = CreateLeaveSchema.safeParse(raw)
  if (!parsed.success) {
    return err(makeApptError('VALIDATION_ERROR', parsed.error.message))
  }
  const res = await createDoctorLeave(doctorId, {
    ...parsed.data,
    created_by: identity.userId,
  })
  if ('code' in res) return err(res)
  return ok(res, 201)
}

export async function PUT(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const identity = await resolveIdentity()
  if ('code' in identity) return err(identity)
  const deny = requireRoles(identity, ['Admin', 'Doctor'])
  if (deny) return err(deny)
  const { id } = await ctx.params
  const doctorId = Number(id)
  // leaveId can be in query or in a dedicated [leaveId] route. We accept both.
  const url = new URL(req.url)
  const leaveIdRaw =
    url.searchParams.get('leave_id') ?? (await ctx.params).id /* fallthrough */
  const leaveId = Number(
    url.searchParams.get('leave_id') ??
      new URL(req.url).pathname.split('/').reverse()[0],
  )
  if (!Number.isFinite(doctorId)) {
    return err(makeApptError('VALIDATION_ERROR', 'Invalid doctor id'))
  }
  if (!Number.isFinite(leaveId)) {
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
  const res = await updateDoctorLeave(doctorId, leaveId, parsed.data)
  if ('code' in res) return err(res)
  return ok(res)
}
