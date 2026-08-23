import { createServiceClient } from '@/utils/supabase/service'
import {
  resolveIdentity,
  requireRoles,
  ok,
  err,
} from '@/lib/appointments/api-helpers'
import { makeApptError } from '@/lib/appointments/error-codes'
import { previewDoctorLeaveConflicts } from '@/lib/appointments/leave-service'

/**
 * GET /api/admin/doctors/[id]/conflicts?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD
 * Admin-only preview of conflicts for a proposed leave window.
 */
export async function GET(
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
  const url = new URL(req.url)
  const start_date = url.searchParams.get('start_date')
  const end_date = url.searchParams.get('end_date')
  if (!start_date || !end_date) {
    return err(
      makeApptError('VALIDATION_ERROR', 'start_date and end_date are required'),
    )
  }
  if (new Date(start_date) > new Date(end_date)) {
    return err(makeApptError('INVALID_DATE_RANGE', 'start > end'))
  }
  const preview = await previewDoctorLeaveConflicts(
    doctorId,
    start_date,
    end_date,
    createServiceClient() as any,
  )
  return ok(preview)
}
