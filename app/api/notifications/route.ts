import { createClient } from '@/utils/supabase/server'
import {
  resolveIdentity,
  requireRoles,
  ok,
  err,
} from '@/lib/appointments/api-helpers'
import { makeApptError } from '@/lib/appointments/error-codes'
import {
  NotificationTypeSchema,
} from '@/lib/validation/appointment'

const VALID_STATUSES = [
  'PENDING',
  'QUEUED',
  'SENDING',
  'SENT',
  'DELIVERED',
  'FAILED',
  'CANCELLED',
] as const

export async function GET(req: Request) {
  const identity = await resolveIdentity()
  if ('code' in identity) return err(identity)
  const deny = requireRoles(identity, [
    'Admin',
    'Doctor',
    'Nurse',
    'Pharmacist',
    'Patient',
  ])
  if (deny) return err(deny)

  const url = new URL(req.url)
  const typeQuery = url.searchParams.get('type')
  const statusQuery = url.searchParams.get('status')
  const limitRaw = url.searchParams.get('limit')

  let typeFilter: string | undefined
  if (typeQuery) {
    const typeParsed = NotificationTypeSchema.safeParse(typeQuery)
    if (typeParsed.success) {
      typeFilter = typeParsed.data
    } else {
      const validTypes = [
        'BOOKING_CONFIRMATION',
        'APPOINTMENT_REMINDER',
        'APPOINTMENT_CANCELLATION',
        'APPOINTMENT_RESCHEDULE',
        'DOCTOR_LEAVE_CONFLICT',
        'MEDICATION_REMINDER',
        'PREVISIT_SUMMARY_READY',
        'POSTVISIT_SUMMARY_READY',
        'SYSTEM_ADMIN',
      ]
      if (validTypes.includes(typeQuery)) {
        typeFilter = typeQuery
      }
    }
  }

  let statusFilter: string | undefined
  if (statusQuery) {
    const upper = statusQuery.toUpperCase()
    if ((VALID_STATUSES as readonly string[]).includes(upper)) {
      statusFilter = upper
    }
  }

  let limit: number | undefined
  if (limitRaw) {
    const parsed = Number(limitRaw)
    if (Number.isFinite(parsed) && parsed > 0 && parsed <= 500) {
      limit = parsed
    }
  }

  const supabase = (await createClient()) as any
  try {
    let query = supabase
      .from('notifications')
      .select('*')

    if (identity.role === 'Admin') {
      // Admin sees all — no ownership filter
    } else if (identity.role === 'Patient') {
      if (identity.patientId) {
        query = query.or(
          `patient_id.eq.${identity.patientId},user_id.eq.${identity.userId}`,
        )
      } else {
        query = query.eq('user_id', identity.userId)
      }
    } else {
      // Doctor / Nurse / Pharmacist — staff
      if (identity.staffId) {
        query = query.or(
          `staff_id.eq.${identity.staffId},user_id.eq.${identity.userId}`,
        )
      } else {
        query = query.eq('user_id', identity.userId)
      }
    }

    if (typeFilter) {
      query = query.eq('type', typeFilter)
    }
    if (statusFilter) {
      query = query.eq('status', statusFilter)
    }

    query = query
      .order('created_at', { ascending: false })
      .limit(limit ?? 100)

    const { data, error } = await query
    if (error) return err(makeApptError('INTERNAL_ERROR', error.message))

    return ok({ notifications: data ?? [] })
  } catch (e: any) {
    return err(makeApptError('INTERNAL_ERROR', e?.message ?? 'Internal error'))
  }
}
