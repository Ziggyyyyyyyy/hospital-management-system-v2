import {
  resolveIdentity,
  requireRoles,
  ok,
  err,
} from '@/lib/appointments/api-helpers'
import { makeApptError } from '@/lib/appointments/error-codes'
import { retryFailedNotifications } from '@/lib/notifications/notification-service'
import type {
  NotificationType,
} from '@/lib/notifications/notification-service'

const VALID_TYPES = [
  'BOOKING_CONFIRMATION',
  'APPOINTMENT_REMINDER',
  'APPOINTMENT_CANCELLATION',
  'APPOINTMENT_RESCHEDULE',
  'DOCTOR_LEAVE_CONFLICT',
  'MEDICATION_REMINDER',
  'PREVISIT_SUMMARY_READY',
  'POSTVISIT_SUMMARY_READY',
  'SYSTEM_ADMIN',
] as const

export async function POST(req: Request) {
  const identity = await resolveIdentity()
  if ('code' in identity) return err(identity)
  const deny = requireRoles(identity, ['Admin'])
  if (deny) return err(deny)

  let body: Record<string, unknown> = {}
  try {
    body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  } catch {
    // body is optional
  }

  let limit: number | undefined
  if (body.limit !== undefined && body.limit !== null) {
    const parsed = Number(body.limit)
    if (Number.isFinite(parsed) && parsed > 0) {
      limit = parsed
    }
  }

  let types: NotificationType[] | undefined
  if (Array.isArray(body.types) && body.types.length > 0) {
    const filtered = body.types.filter(
      (t) => typeof t === 'string' && VALID_TYPES.includes(t as any),
    ) as NotificationType[]
    if (filtered.length > 0) {
      types = filtered
    }
  }

  try {
    const summary = await retryFailedNotifications({ limit, types })
    return ok(summary)
  } catch (e: any) {
    return err(makeApptError('INTERNAL_ERROR', e?.message ?? 'Retry failed unexpectedly'))
  }
}
