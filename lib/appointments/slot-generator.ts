import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceClient } from '../../utils/supabase/service'
import type { DoctorAvailabilityRow } from './availability-service'
import { listDoctorAvailability } from './availability-service'

// ============================================================
// Slot generation service (server-only, deterministic)
//
// Core algorithm (mirrors the PL/pgSQL `generate_doctor_slots`):
//  1. Iterate active availability rows.
//  2. Iterate dates [from, to] ∩ [valid_from, valid_until].
//  3. Skip dates not matching day_of_week.
//  4. Skip dates covered by approved/pending leave.
//  5. Emit [start..end] stepping by duration_minutes,
//     skipping any slot that is already booked/held/blocked.
//  6. Batch INSERT with ON CONFLICT DO NOTHING.
// ============================================================

export interface GeneratedSlot {
  doctor_id: number
  start_time: Date
  end_time: Date
  duration_minutes: number
  status: 'AVAILABLE'
}

export interface SlotRow {
  slot_id: number
  doctor_id: number
  start_time: string
  end_time: string
  duration_minutes: number
  status: 'AVAILABLE' | 'HELD' | 'BOOKED' | 'BLOCKED' | 'EXPIRED'
}

export async function generateSlotsForDoctor(
  doctorId: number,
  params: {
    from_date: string // ISO yyyy-mm-dd
    to_date: string
    force_rebuild?: boolean
  },
  clientOverride?: SupabaseClient,
): Promise<{ inserted: number; considered: number }> {
  const supabase = clientOverride ?? createServiceClient()
  const { from_date, to_date, force_rebuild } = { force_rebuild: false, ...params }

  if (new Date(from_date) > new Date(to_date)) {
    throw new Error('from_date must be <= to_date')
  }

  // (Optional) delete existing AVAILABLE slots in range (force rebuild)
  if (force_rebuild) {
    await supabase
      .from('appointment_slots')
      .delete()
      .eq('doctor_id', doctorId)
      .eq('status', 'AVAILABLE')
      .gte('start_time', `${from_date}T00:00:00Z`)
      .lte('start_time', `${to_date}T23:59:59Z`)
  }

  const availabilities = await listDoctorAvailability(doctorId, supabase)
  const leaveDates = await fetchLeaveDateSets(doctorId, supabase)
  const existingSlotKeys = await fetchExistingSlotKeys(
    doctorId,
    from_date,
    to_date,
    supabase,
  )

  const slots: GeneratedSlot[] = []
  for (const av of availabilities) {
    if (!av.active) continue
    const effectiveFrom = maxDate(from_date, av.valid_from)
    const effectiveTo = minDate(to_date, av.valid_until)
    if (new Date(effectiveFrom) > new Date(effectiveTo)) continue

    const durationMs = av.slot_duration_minutes * 60 * 1000
    const cursor = new Date(`${effectiveFrom}T00:00:00Z`)
    const last = new Date(`${effectiveTo}T23:59:59Z`)
    while (cursor <= last) {
      const iso = cursor.toISOString().slice(0, 10)
      const dow = isoSundayDow(cursor)
      if (dow === av.day_of_week) {
        // skip leave
        if (!leaveDates.has(iso)) {
          const dayStart = new Date(
            `${iso}T${pad(av.start_time).slice(0, 8)}Z`,
          )
          const dayEnd = new Date(`${iso}T${pad(av.end_time).slice(0, 8)}Z`)
          let c = new Date(dayStart)
          while (c.getTime() + durationMs <= dayEnd.getTime()) {
            const e = new Date(c.getTime() + durationMs)
            const key = slotKey(doctorId, c)
            if (!existingSlotKeys.has(key)) {
              slots.push({
                doctor_id: doctorId,
                start_time: c,
                end_time: e,
                duration_minutes: av.slot_duration_minutes,
                status: 'AVAILABLE',
              })
              existingSlotKeys.add(key)
            }
            c = e
          }
        }
      }
      cursor.setDate(cursor.getDate() + 1)
    }
  }

  const considered = slots.length
  let inserted = 0
  // batch insert in chunks (Postgres row limit)
  const BATCH = 500
  for (let i = 0; i < slots.length; i += BATCH) {
    const batch = slots.slice(i, i + BATCH).map((s) => ({
      doctor_id: s.doctor_id,
      start_time: s.start_time.toISOString(),
      end_time: s.end_time.toISOString(),
      duration_minutes: s.duration_minutes,
      status: 'AVAILABLE' as const,
    }))
    const { error } = await supabase
      .from('appointment_slots')
      .insert(batch as unknown as Record<string, unknown>[])
    if (error) {
      // unique violation on some rows is fine, we use the server-side unique
      // index to catch them, but here we retry one-by-one to get an accurate
      // insert count.
      for (const row of batch) {
        const res = await supabase
          .from('appointment_slots')
          .insert(row as unknown as Record<string, unknown>)
        if (!res.error) inserted++
      }
    } else {
      inserted += batch.length
    }
  }
  return { inserted, considered }
}

// ------------------------------------------------------------
// Leave date helpers — returns set of ISO date strings
// ------------------------------------------------------------
export async function fetchLeaveDateSets(
  doctorId: number,
  client: SupabaseClient,
): Promise<Set<string>> {
  const { data } = await client
    .from('doctor_leave')
    .select('start_date, end_date')
    .eq('doctor_id', doctorId)
    .in('status', ['PENDING', 'APPROVED'])
  const set = new Set<string>()
  for (const row of data ?? []) {
    const s = new Date(`${row.start_date}T00:00:00Z`)
    const e = new Date(`${row.end_date}T00:00:00Z`)
    const c = new Date(s)
    while (c <= e) {
      set.add(c.toISOString().slice(0, 10))
      c.setDate(c.getDate() + 1)
    }
  }
  return set
}

async function fetchExistingSlotKeys(
  doctorId: number,
  from_date: string,
  to_date: string,
  client: SupabaseClient,
): Promise<Set<string>> {
  const { data } = await client
    .from('appointment_slots')
    .select('start_time, status')
    .eq('doctor_id', doctorId)
    .gte('start_time', `${from_date}T00:00:00Z`)
    .lte('start_time', `${to_date}T23:59:59Z`)
    .in('status', ['AVAILABLE', 'HELD', 'BOOKED'])
  const set = new Set<string>()
  for (const row of data ?? []) {
    set.add(slotKey(doctorId, new Date(row.start_time)))
  }
  return set
}

export function slotKey(doctorId: number, start: Date): string {
  // use millisecond-truncated UTC ISO for key
  return `${doctorId}:${start.toISOString()}`
}

// Convert a date into the convention used by doctor_availability.day_of_week
// where 0 = Sunday, 6 = Saturday. (JS getUTCDay gives exactly this.)
export function isoSundayDow(d: Date): number {
  return d.getUTCDay()
}

export function maxDate(a: string, b: string | null | undefined): string {
  if (!b) return a
  return new Date(a) >= new Date(b) ? a : b
}
export function minDate(a: string, b: string | null | undefined): string {
  if (!b) return a
  return new Date(a) <= new Date(b) ? a : b
}

// ensure 'HH:MM' or 'HH:MM:SS' has leading zeros for string parsing
function pad(time: string): string {
  if (/^\d{1}:/.test(time)) time = '0' + time
  if (time.length === 5) return time + ':00'
  return time
}

// List existing slots for a doctor + date range. Works with anon/supabase caller.
export async function listSlots(
  doctorId: number,
  range: { date_from?: string; date_to?: string; status?: string },
  client: SupabaseClient,
): Promise<SlotRow[]> {
  let q = client
    .from('appointment_slots')
    .select('*')
    .eq('doctor_id', doctorId)
    .order('start_time')
  if (range.date_from) q = q.gte('start_time', `${range.date_from}T00:00:00Z`)
  if (range.date_to) q = q.lte('start_time', `${range.date_to}T23:59:59Z`)
  if (range.status) q = q.eq('status', range.status)
  const { data } = await q
  return (data ?? []) as SlotRow[]
}

// Expose availability rules shape (re-export for convenience)
export type { DoctorAvailabilityRow }

// ------------------------------------------------------------
// Date-range helpers used by API routes for defaults.
// ------------------------------------------------------------
export function getDefaultDateRange(days = 30): {
  from_date: string
  to_date: string
} {
  const from = new Date()
  const to = new Date(from.getTime() + days * 24 * 60 * 60 * 1000)
  return {
    from_date: from.toISOString().slice(0, 10),
    to_date: to.toISOString().slice(0, 10),
  }
}
