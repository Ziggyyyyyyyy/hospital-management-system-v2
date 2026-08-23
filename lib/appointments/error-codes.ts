export type { ApptErrorResult }
import type { ApptErrorResult, AppointmentStatus } from '../../lib/validation/appointment'

/** Translate a postgres ERRCODE into our typed ApptErrorCode. */
export function mapPgErrorCode(err: {
  code?: string
  message?: string
}): ApptErrorResult['code'] {
  switch (err.code) {
    case 'P0S01':
      return 'SLOT_NOT_AVAILABLE'
    case 'P0S02':
      return 'FORBIDDEN'
    case 'P0S03':
      return 'DOCTOR_ON_LEAVE'
    case 'P0S04':
      return 'SLOT_NOT_AVAILABLE'
    case 'P0B01':
      return 'INVALID_HOLD'
    case 'P0B02':
      return 'HOLD_NOT_OWNED'
    case 'P0B03':
      return 'SLOT_HOLD_EXPIRED'
    case 'P0B04':
      return 'BOOKING_CONFLICT'
    case 'P0B05':
      return 'APPOINTMENT_ALREADY_CONFIRMED'
    case 'P0T01':
      return 'INVALID_APPOINTMENT_STATE'
    case '23505':
      return 'BOOKING_CONFLICT'
    case '22000':
      return 'VALIDATION_ERROR'
    default:
      return 'INTERNAL_ERROR'
  }
}

export function statusCodeForApptError(code: ApptErrorResult['code']): number {
  switch (code) {
    case 'UNAUTHORIZED':
      return 401
    case 'FORBIDDEN':
    case 'HOLD_NOT_OWNED':
      return 403
    case 'VALIDATION_ERROR':
    case 'INVALID_HOLD':
    case 'SLOT_HOLD_EXPIRED':
    case 'APPOINTMENT_ALREADY_CONFIRMED':
    case 'INVALID_APPOINTMENT_STATE':
    case 'INVALID_DATE_RANGE':
      return 400
    case 'SLOT_NOT_AVAILABLE':
    case 'SLOT_ALREADY_HELD':
    case 'DOCTOR_ON_LEAVE':
    case 'BOOKING_CONFLICT':
      return 409
    case 'APPOINTMENT_NOT_FOUND':
    case 'DOCTOR_NOT_FOUND':
    case 'SLOT_NOT_FOUND':
      return 404
    case 'INTERNAL_ERROR':
    default:
      return 500
  }
}

export function makeApptError(
  code: ApptErrorResult['code'],
  message: string,
  details?: Record<string, unknown>,
): ApptErrorResult & { statusCode: number } {
  return {
    code,
    message,
    details,
    statusCode: statusCodeForApptError(code),
  }
}

/** Appointment state machine — valid transitions list */
export const VALID_APPOINTMENT_TRANSITIONS: Record<
  AppointmentStatus,
  AppointmentStatus[]
> = {
  HELD: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: [
    'COMPLETED',
    'CANCELLED',
    'RESCHEDULE_REQUIRED',
    'DOCTOR_LEAVE_CONFLICT',
  ],
  COMPLETED: [],
  CANCELLED: [],
  RESCHEDULE_REQUIRED: ['CONFIRMED', 'CANCELLED'],
  DOCTOR_LEAVE_CONFLICT: ['RESCHEDULE_REQUIRED', 'CANCELLED', 'CONFIRMED'],
}

export function isApptTransitionValid(
  from: AppointmentStatus,
  to: AppointmentStatus,
): boolean {
  if (from === to) return true
  return VALID_APPOINTMENT_TRANSITIONS[from]?.includes(to) ?? false
}
