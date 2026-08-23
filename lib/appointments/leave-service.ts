import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceClient } from '../../utils/supabase/service'
import type {
  CreateLeaveInput,
  UpdateLeaveInput,
} from '../../lib/validation/appointment'
import { makeApptError, type ApptErrorResult } from './error-codes'
import { outboxLeaveConflictForAppointment } from './event-outbox'

// ============================================================
// Doctor leave service + conflict resolution trigger
// ============================================================

export interface LeaveRow {
  leave_id: number
  doctor_id: number
  start_date: string
  end_date: string
  reason: string | null
  leave_type: 'VACATION' | 'SICK' | 'PERSONAL' | 'EMERGENCY' | 'OTHER'
  status: 'PENDING' | 'APPROVED' | 'DENIED' | 'CANCELLED'
  created_by: string | null
  created_at: string
  updated_at: string
}

export async function listDoctorLeave(
  doctorId: number,
  clientOverride?: SupabaseClient,
): Promise<LeaveRow[]> {
  const supabase = clientOverride ?? createServiceClient()
  const { data } = await supabase
    .from('doctor_leave')
    .select('*')
    .eq('doctor_id', doctorId)
    .order('start_date', { ascending: false })
  return (data ?? []) as LeaveRow[]
}

export async function createDoctorLeave(
  doctorId: number,
  input: CreateLeaveInput & { created_by: string | null },
  clientOverride?: SupabaseClient,
): Promise<
  | {
      leave: LeaveRow
      affectedAppointments: number
      affectedSlots: number
    }
  | ApptErrorResult
> {
  const supabase = clientOverride ?? createServiceClient()
  // 1. create leave row
  const { data: leave, error } = await supabase
    .from('doctor_leave')
    .insert({
      doctor_id: doctorId,
      start_date: input.start_date,
      end_date: input.end_date,
      reason: input.reason ?? null,
      leave_type: input.leave_type,
      status: input.status,
      created_by: input.created_by ?? null,
    })
    .select()
    .maybeSingle()
  if (error) {
    if (error.code === '23505') {
      return makeApptError(
        'BOOKING_CONFLICT',
        'Overlapping leave record already exists',
      )
    }
    return makeApptError('INTERNAL_ERROR', error.message)
  }

  // 2. If approved or pending — apply conflict processing now. (Pending blocks
  //    slots early in the generator; applying conflicts immediately avoids
  //    appointments booked during the pending window.)
  let affectedAppointments = 0
  let affectedSlots = 0
  if (input.status === 'APPROVED' || input.status === 'PENDING') {
    const res = await processDoctorLeaveConflicts(
      doctorId,
      input.start_date,
      input.end_date,
      supabase,
    )
    if (!('code' in res)) {
      affectedAppointments = res.appointments_conflicted
      affectedSlots = res.slots_blocked + res.holds_released
      if (res.appointments_conflicted > 0) {
        void fireLeaveConflictNotificationsForRange(
          doctorId,
          input.start_date,
          input.end_date,
          input.reason ?? null,
        ).catch(() => {})
      }
    }
  }
  return {
    leave: leave as LeaveRow,
    affectedAppointments,
    affectedSlots,
  }
}

export async function updateDoctorLeave(
  doctorId: number,
  leaveId: number,
  patch: UpdateLeaveInput,
  clientOverride?: SupabaseClient,
): Promise<
  | {
      leave: LeaveRow | null
      affectedAppointments: number
      affectedSlots: number
    }
  | ApptErrorResult
> {
  const supabase = clientOverride ?? createServiceClient()
  const { data, error } = await supabase
    .from('doctor_leave')
    .update({
      ...(patch.start_date ? { start_date: patch.start_date } : {}),
      ...(patch.end_date ? { end_date: patch.end_date } : {}),
      ...(patch.reason !== undefined ? { reason: patch.reason ?? null } : {}),
      ...(patch.leave_type ? { leave_type: patch.leave_type } : {}),
      ...(patch.status ? { status: patch.status } : {}),
    })
    .eq('leave_id', leaveId)
    .eq('doctor_id', doctorId)
    .select()
    .maybeSingle()
  if (error) return makeApptError('INTERNAL_ERROR', error.message)
  let affectedAppointments = 0
  let affectedSlots = 0
  if (
    (patch.status === 'APPROVED' || patch.status === 'PENDING') &&
    data
  ) {
    const res = await processDoctorLeaveConflicts(
      doctorId,
      data.start_date,
      data.end_date,
      supabase,
    )
    if (!('code' in res)) {
      affectedAppointments = res.appointments_conflicted
      affectedSlots = res.slots_blocked + res.holds_released
      if (res.appointments_conflicted > 0) {
        void fireLeaveConflictNotificationsForRange(
          doctorId,
          data.start_date,
          data.end_date,
          data.reason,
        ).catch(() => {})
      }
    }
  }
  return {
    leave: data as LeaveRow | null,
    affectedAppointments,
    affectedSlots,
  }
}

export async function deleteDoctorLeave(
  doctorId: number,
  leaveId: number,
  clientOverride?: SupabaseClient,
): Promise<boolean> {
  const supabase = clientOverride ?? createServiceClient()
  const { error } = await supabase
    .from('doctor_leave')
    .delete()
    .eq('leave_id', leaveId)
    .eq('doctor_id', doctorId)
  if (error) return false
  return true
}

/**
 * Runs `process_doctor_leave_conflicts` RPC.
 * Returns counts of { slots_blocked, holds_released, appointments_conflicted }
 * or ApptErrorResult.
 */
export async function processDoctorLeaveConflicts(
  doctorId: number,
  start_date: string,
  end_date: string,
  clientOverride?: SupabaseClient,
): Promise<
  | {
      slots_blocked: number
      holds_released: number
      appointments_conflicted: number
    }
  | ApptErrorResult
> {
  const supabase = clientOverride ?? createServiceClient()
  try {
    const { data, error } = await supabase.rpc('process_doctor_leave_conflicts', {
      p_doctor_id: doctorId,
      p_start_date: start_date,
      p_end_date: end_date,
    })
    if (error) throw error
    const row = (data as unknown as any[] | null)?.[0]
    if (!row) return makeApptError('INTERNAL_ERROR', 'No response from RPC')
    return row
  } catch (err) {
    const e = err as { code?: string; message?: string }
    return makeApptError('INTERNAL_ERROR', e.message ?? 'Conflict RPC failed')
  }
}

/**
 * Pre-check conflicts WITHOUT persisting anything.
 * Returns counts of what WOULD be affected if this leave were applied.
 */
export async function previewDoctorLeaveConflicts(
  doctorId: number,
  start_date: string,
  end_date: string,
  clientOverride?: SupabaseClient,
): Promise<{
  affectedSlots: number
  affectedAppointments: number
  affectedHolds: number
}> {
  const supabase = clientOverride ?? createServiceClient()
  const [slots, holds, appts] = await Promise.all([
    supabase
      .from('appointment_slots')
      .select('slot_id', { count: 'exact', head: true })
      .eq('doctor_id', doctorId)
      .gte('start_time', `${start_date}T00:00:00Z`)
      .lte('start_time', `${end_date}T23:59:59Z`)
      .in('status', ['AVAILABLE', 'HELD']),
    supabase
      .from('slot_holds')
      .select('hold_id', { count: 'exact', head: true })
      .eq('status', 'ACTIVE')
      .in('slot_id', (
        await supabase
          .from('appointment_slots')
          .select('slot_id')
          .eq('doctor_id', doctorId)
          .gte('start_time', `${start_date}T00:00:00Z`)
          .lte('start_time', `${end_date}T23:59:59Z`)
      ).data?.map((r: any) => r.slot_id) ?? []),
    supabase
      .from('appointments')
      .select('appointment_id', { count: 'exact', head: true })
      .eq('doctor_id', doctorId)
      .eq('status', 'CONFIRMED')
      .in('slot_id', (
        await supabase
          .from('appointment_slots')
          .select('slot_id')
          .eq('doctor_id', doctorId)
          .gte('start_time', `${start_date}T00:00:00Z`)
          .lte('start_time', `${end_date}T23:59:59Z`)
      ).data?.map((r: any) => r.slot_id) ?? []),
  ])
  return {
    affectedSlots: Number(slots.count ?? 0),
    affectedHolds: Number(holds.count ?? 0),
    affectedAppointments: Number(appts.count ?? 0),
  }
}

async function fireLeaveConflictNotificationsForRange(
  doctorId: number,
  start_date: string,
  end_date: string,
  reason: string | null,
  clientOverride?: SupabaseClient,
): Promise<void> {
  try {
    const supabase = clientOverride ?? createServiceClient()
    const { data, error } = await supabase
      .from('appointments')
      .select('appointment_id, slot_id, appointment_slots(start_time)')
      .eq('doctor_id', doctorId)
      .eq('status', 'CONFIRMED')
      .gte('appointment_slots.start_time', `${start_date}T00:00:00Z`)
      .lte('appointment_slots.start_time', `${end_date}T23:59:59Z`)

    if (error) return
    const rows = (data ?? []) as Array<{ appointment_id: number }>
    for (const r of rows) {
      void outboxLeaveConflictForAppointment(r.appointment_id, {
        start_date,
        end_date,
        reason,
      }).catch(() => {})
    }
  } catch {
    // never propagate - leave emails are best-effort only
  }
}
