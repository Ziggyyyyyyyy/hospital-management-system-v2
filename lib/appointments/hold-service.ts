import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceClient } from '../../utils/supabase/service'
import {
  mapPgErrorCode,
  makeApptError,
  type ApptErrorResult,
} from './error-codes'

// ============================================================
// Hold service — server side only.
// Always uses service client when calling RPCs because the
// caller (patient) identity is verified in the API handler and
// we pass in patient_id/doctor_id explicitly; using service-role
// avoids RLS interactions when locking rows (RPCs run as
// SECURITY INVOKER by default, so they honour RLS — using
// service role ensures we can always execute them).
// ============================================================

export const DEFAULT_HOLD_DURATION_S =
  Number(process.env.APPOINTMENT_HOLD_DURATION_SECONDS || 0) || 300

export interface HoldAcquireResult {
  hold_id: bigint
  hold_token: string
  expires_at: string
  slot_id: bigint
  start_time: string
  end_time: string
}

export async function acquireHold(
  params: {
    doctor_id: number
    slot_id: number
    patient_id: number
    hold_duration_seconds?: number
  },
  clientOverride?: SupabaseClient,
): Promise<HoldAcquireResult | ApptErrorResult> {
  const supabase = clientOverride ?? createServiceClient()
  const holdDuration =
    params.hold_duration_seconds ?? DEFAULT_HOLD_DURATION_S

  try {
    const { data, error } = await supabase.rpc('atomic_hold_slot', {
      p_doctor_id: params.doctor_id,
      p_slot_id: params.slot_id,
      p_patient_id: params.patient_id,
      p_hold_duration_s: holdDuration,
      p_allow_expire: true,
    })

    if (error) throw error
    const row = (data as unknown as HoldAcquireResult[] | null)?.[0]
    if (!row) {
      return makeApptError('SLOT_NOT_AVAILABLE', 'Could not acquire hold')
    }
    return row
  } catch (err: unknown) {
    const e = err as { code?: string; message?: string }
    const code = mapPgErrorCode(e)
    return makeApptError(code, e.message ?? 'Failed to acquire hold', {
      pg_code: e.code,
    })
  }
}

export async function releaseHold(
  hold_token: string,
  patient_id: number,
  clientOverride?: SupabaseClient,
): Promise<boolean> {
  const supabase = clientOverride ?? createServiceClient()
  const { data, error } = await supabase.rpc('atomic_release_hold', {
    p_hold_token: hold_token,
    p_patient_id: patient_id,
  })
  if (error) return false
  return Boolean(data)
}

/** Expire stale holds. Safe to call repeatedly. Returns count expired. */
export async function expireStaleHolds(
  clientOverride?: SupabaseClient,
): Promise<number> {
  const supabase = clientOverride ?? createServiceClient()
  const { data, error } = await supabase.rpc('expire_stale_holds')
  if (error) throw error
  return Number(data ?? 0)
}
