import { createServiceClient } from '../../utils/supabase/service'
import type {
  CreateAvailabilityInput,
  UpdateAvailabilityInput,
} from '../../lib/validation/appointment'
import type { SupabaseClient } from '@supabase/supabase-js'

// ============================================================
// Doctor availability service (server-side only)
// ============================================================

export interface DoctorAvailabilityRow {
  id: number
  doctor_id: number
  day_of_week: number
  start_time: string
  end_time: string
  slot_duration_minutes: number
  active: boolean
  valid_from: string | null
  valid_until: string | null
  created_at: string
  updated_at: string
}

const DEFAULT_RANGE_DAYS =
  Number(process.env.APPOINTMENT_SLOT_GENERATION_DAYS_AHEAD || 0) || 60

export const getDefaultDateRange = (): {
  from_date: string
  to_date: string
} => {
  const from_date = new Date()
  from_date.setHours(0, 0, 0, 0)
  const to_date = new Date(from_date)
  to_date.setDate(to_date.getDate() + DEFAULT_RANGE_DAYS)
  return {
    from_date: from_date.toISOString().slice(0, 10),
    to_date: to_date.toISOString().slice(0, 10),
  }
}

/**
 * Lists availability rules for a doctor.
 * Accepts either anon or service client. Uses service client by default
 * so it can be called from tests/slots generator background jobs.
 */
export async function listDoctorAvailability(
  doctorId: number,
  clientOverride?: SupabaseClient,
): Promise<DoctorAvailabilityRow[]> {
  const supabase = clientOverride ?? createServiceClient()
  const { data } = await supabase
    .from('doctor_availability')
    .select('*')
    .eq('doctor_id', doctorId)
    .order('day_of_week')
    .order('start_time')
  return (data ?? []) as DoctorAvailabilityRow[]
}

export async function createDoctorAvailability(
  doctorId: number,
  input: CreateAvailabilityInput,
  clientOverride?: SupabaseClient,
): Promise<DoctorAvailabilityRow> {
  const supabase = clientOverride ?? createServiceClient()
  if (!isTimeOrderValid(input.start_time, input.end_time)) {
    throw new Error('start_time must be strictly before end_time')
  }
  const { data, error } = await supabase
    .from('doctor_availability')
    .insert({
      doctor_id: doctorId,
      day_of_week: input.day_of_week,
      start_time: input.start_time,
      end_time: input.end_time,
      slot_duration_minutes: input.slot_duration_minutes,
      active: input.active,
      valid_from: input.valid_from ?? null,
      valid_until: input.valid_until ?? null,
    })
    .select()
    .single()

  if (error) throw error
  return data as DoctorAvailabilityRow
}

export async function updateDoctorAvailability(
  doctorId: number,
  availabilityId: number,
  patch: UpdateAvailabilityInput,
  clientOverride?: SupabaseClient,
): Promise<DoctorAvailabilityRow | null> {
  const supabase = clientOverride ?? createServiceClient()
  if (patch.start_time && patch.end_time) {
    if (!isTimeOrderValid(patch.start_time, patch.end_time)) {
      throw new Error('start_time must be strictly before end_time')
    }
  }
  const { data, error } = await supabase
    .from('doctor_availability')
    .update({
      ...(patch.day_of_week !== undefined ? { day_of_week: patch.day_of_week } : {}),
      ...(patch.start_time !== undefined ? { start_time: patch.start_time } : {}),
      ...(patch.end_time !== undefined ? { end_time: patch.end_time } : {}),
      ...(patch.slot_duration_minutes !== undefined
        ? { slot_duration_minutes: patch.slot_duration_minutes }
        : {}),
      ...(patch.active !== undefined ? { active: patch.active } : {}),
      ...(patch.valid_from !== undefined ? { valid_from: patch.valid_from ?? null } : {}),
      ...(patch.valid_until !== undefined ? { valid_until: patch.valid_until ?? null } : {}),
    })
    .eq('id', availabilityId)
    .eq('doctor_id', doctorId)
    .select()
    .maybeSingle()

  if (error) throw error
  return data as DoctorAvailabilityRow | null
}

export async function deleteDoctorAvailability(
  doctorId: number,
  availabilityId: number,
  clientOverride?: SupabaseClient,
): Promise<boolean> {
  const supabase = clientOverride ?? createServiceClient()
  const { error } = await supabase
    .from('doctor_availability')
    .delete()
    .eq('id', availabilityId)
    .eq('doctor_id', doctorId)
  if (error) throw error
  return true
}

function isTimeOrderValid(a: string, b: string): boolean {
  const toMin = (t: string) => {
    const [h, m] = t.split(':').map(Number)
    return h * 60 + (m ?? 0)
  }
  return toMin(a) < toMin(b)
}
