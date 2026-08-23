import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceClient } from '../../utils/supabase/service'
import {
  mapPgErrorCode,
  makeApptError,
  type ApptErrorResult,
} from './error-codes'
import type { ConfirmBookingInput } from '../../lib/validation/appointment'

// ============================================================
// Booking / appointment core service.
// ============================================================

export interface AppointmentRow {
  appointment_id: number
  slot_id: number | null
  patient_id: number
  doctor_id: number
  status:
    | 'HELD'
    | 'CONFIRMED'
    | 'COMPLETED'
    | 'CANCELLED'
    | 'RESCHEDULE_REQUIRED'
    | 'DOCTOR_LEAVE_CONFLICT'
  reason_for_visit: string | null
  booked_at: string | null
  booked_by_user_id: string | null
  confirmed_at: string | null
  completed_at: string | null
  cancelled_at: string | null
  cancel_reason: string | null
  cancel_reason_text: string | null
  reschedule_count: number
  rescheduled_from_id: number | null
  original_appointment_id: number | null
  timezone: string
  idempotency_key: string | null
  legacy_record_id: number | null
  created_at: string
  updated_at: string
}

export interface ConfirmBookingResult {
  appointment_id: bigint
  slot_id: bigint
  doctor_id: bigint
  patient_id: bigint
  status: string
  is_idempotent: boolean
}

export async function confirmBooking(
  params: ConfirmBookingInput & {
    patient_id: number
    booked_by_user_id: string | null
  },
  clientOverride?: SupabaseClient,
): Promise<ConfirmBookingResult | ApptErrorResult> {
  const supabase = clientOverride ?? createServiceClient()
  try {
    const { data, error } = await supabase.rpc('atomic_confirm_booking', {
      p_hold_token: params.hold_token,
      p_patient_id: params.patient_id,
      p_reason: params.reason_for_visit ?? null,
      p_timezone: params.timezone ?? 'UTC',
      p_idempotency: params.idempotency_key ?? null,
      p_booked_by: params.booked_by_user_id ?? null,
    })
    if (error) throw error
    const row = (data as unknown as ConfirmBookingResult[] | null)?.[0]
    if (!row) {
      return makeApptError('BOOKING_CONFLICT', 'No result from booking RPC')
    }
    return row
  } catch (err: unknown) {
    const e = err as { code?: string; message?: string }
    const code = mapPgErrorCode(e)
    return makeApptError(code, e.message ?? 'Failed to confirm booking', {
      pg_code: e.code,
    })
  }
}

// Cancel appointment (patient / doctor / admin path)
export async function cancelAppointment(
  params: {
    appointment_id: number
    patient_id: number | null
    caller_user_id: string | null
    caller_role: 'Admin' | 'Doctor' | 'Patient'
    reason:
      | 'PATIENT_REQUEST'
      | 'DOCTOR_UNAVAILABLE'
      | 'ADMIN_CANCELLED'
      | 'NO_SHOW'
      | 'OTHER'
    reason_text?: string
  },
  clientOverride?: SupabaseClient,
): Promise<
  | ApptErrorResult
  | {
      success: boolean
      appointment_id: bigint
      old_status: string
      new_status: string
      slot_freed: boolean
    }
> {
  const supabase = clientOverride ?? createServiceClient()
  try {
    const { data, error } = await supabase.rpc('cancel_appointment', {
      p_appointment_id: params.appointment_id,
      p_patient_id: params.patient_id,
      p_caller_user_id: params.caller_user_id ?? null,
      p_caller_role: params.caller_role,
      p_reason: params.reason,
      p_reason_text: params.reason_text ?? null,
    })
    if (error) throw error
    const row = (data as unknown as any[] | null)?.[0]
    if (!row) {
      return makeApptError(
        'APPOINTMENT_NOT_FOUND',
        'Appointment not found or not permitted',
      )
    }
    if (!row.success) {
      if (row.old_status === 'COMPLETED') {
        return makeApptError(
          'INVALID_APPOINTMENT_STATE',
          'Completed appointments cannot be cancelled',
        )
      }
      return makeApptError('FORBIDDEN', 'Not allowed to cancel this appointment')
    }
    return row
  } catch (err: unknown) {
    const e = err as { code?: string; message?: string }
    return makeApptError(mapPgErrorCode(e), e.message ?? 'Cancellation failed', {
      pg_code: e.code,
    })
  }
}

// List a patient's appointments
export async function listPatientAppointments(
  patient_id: number,
  client: SupabaseClient,
): Promise<AppointmentRow[]> {
  const { data } = await client
    .from('appointments')
    .select('*')
    .eq('patient_id', patient_id)
    .order('created_at', { ascending: false })
  return (data ?? []) as AppointmentRow[]
}

// List a doctor's appointments
export async function listDoctorAppointments(
  doctor_id: number,
  client: SupabaseClient,
): Promise<AppointmentRow[]> {
  const { data } = await client
    .from('appointments')
    .select('*')
    .eq('doctor_id', doctor_id)
    .order('created_at', { ascending: false })
  return (data ?? []) as AppointmentRow[]
}

// Get appointment detail
export async function getAppointment(
  appointment_id: number,
  client: SupabaseClient,
): Promise<AppointmentRow | null> {
  const { data } = await client
    .from('appointments')
    .select('*')
    .eq('appointment_id', appointment_id)
    .maybeSingle()
  return (data as AppointmentRow | null) ?? null
}

/**
 * Reschedule — cancel old appointment (as RESCHEDULE_REQUIRED transition
 * is not cancellable via RPC unless we allow CANCELLED). Instead we do
 * this in 2 atomic-looking steps:
 *   1) confirm booking for new slot via its hold token
 *   2) if new confirmation succeeds, mark old appointment's slot as AVAILABLE
 *      and update old appointment status → CANCELLED + bump reschedule_count
 *      on the new appointment, set original_appointment_id.
 */
export async function rescheduleAppointment(
  params: {
    existing_appointment_id: number
    patient_id: number
    caller_user_id: string | null
    new_hold_token: string
    new_slot_id: number
    reason_for_visit?: string
    timezone?: string
    idempotency_key?: string
  },
  clientOverride?: SupabaseClient,
): Promise<
  | ApptErrorResult
  | {
      appointment: AppointmentRow
      cancelled_old: boolean
    }
> {
  const supabase = clientOverride ?? createServiceClient()

  // 1. Fetch and validate existing appt ownership
  const existing = await getAppointment(params.existing_appointment_id, supabase)
  if (!existing) {
    return makeApptError('APPOINTMENT_NOT_FOUND', 'Existing appointment not found')
  }
  if (existing.patient_id !== params.patient_id) {
    return makeApptError('FORBIDDEN', 'Not your appointment')
  }
  if (!['CONFIRMED', 'RESCHEDULE_REQUIRED', 'DOCTOR_LEAVE_CONFLICT'].includes(existing.status)) {
    return makeApptError(
      'INVALID_APPOINTMENT_STATE',
      `Cannot reschedule appointment with status ${existing.status}`,
    )
  }

  // 2. confirm new booking
  const confirmed = await confirmBooking(
    {
      hold_token: params.new_hold_token,
      patient_id: params.patient_id,
      booked_by_user_id: params.caller_user_id,
      reason_for_visit: params.reason_for_visit,
      timezone: params.timezone ?? existing.timezone ?? 'UTC',
      idempotency_key: params.idempotency_key,
    },
    supabase,
  )
  if ('code' in confirmed) return confirmed

  // 3. cancel old appointment — caller_role = 'Admin' so ownership bypass is
  // only applied after we already verified patient_id match above
  const cancel = await cancelAppointment(
    {
      appointment_id: params.existing_appointment_id,
      patient_id: null,
      caller_user_id: params.caller_user_id,
      caller_role: 'Admin',
      reason: 'PATIENT_REQUEST',
      reason_text: 'Rescheduled',
    },
    supabase,
  )

  // 4. annotate new appointment with reschedule_count + lineage links
  const origId = existing.original_appointment_id ?? existing.appointment_id
  const newCount = (existing.reschedule_count ?? 0) + 1
  const { data: newAppt } = await supabase
    .from('appointments')
    .update({
      reschedule_count: newCount,
      rescheduled_from_id: existing.appointment_id,
      original_appointment_id: origId,
    })
    .eq('appointment_id', Number(confirmed.appointment_id))
    .select()
    .maybeSingle()

  return {
    appointment: newAppt as AppointmentRow,
    cancelled_old: !('code' in cancel) && cancel.success,
  }
}
