import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceClient } from '../../utils/supabase/service'
import {
  fireNotification,
  buildMedicationReminder,
  buildDedupeKey,
} from '../notifications/notification-service'

export type ReminderFrequency =
  | 'ONCE_DAILY'
  | 'TWICE_DAILY'
  | 'THRICE_DAILY'
  | 'FOUR_TIMES_DAILY'
  | 'EVERY_6_HOURS'
  | 'EVERY_8_HOURS'
  | 'EVERY_12_HOURS'
  | 'AS_NEEDED'
  | 'BEFORE_MEALS'
  | 'AFTER_MEALS'
  | 'WITH_MEALS'
  | 'BEDTIME'

export type ReminderStatus =
  | 'PENDING'
  | 'SENT'
  | 'DELIVERED'
  | 'FAILED'
  | 'READ'
  | 'SKIPPED'

export interface GenerateRemindersResult {
  created: number
  skipped_duplicates: number
  prescription_item_id: number
  patient_id: number
  error?: string
}

export interface UpdateReminderStatusResult {
  success: boolean
  reminder_id: number
  old_status: string
  new_status: string
  error?: string
}

interface PrescriptionItemRow {
  item_id: number
  prescription_id: number
  medicine_id: number | null
  medicine_name: string
  dosage: string
  frequency: string
  duration_days: number | null
  quantity: number
  instructions: string | null
  created_at: string
  updated_at: string
}

interface PrescriptionRow {
  prescription_id: number
  patient_id: number
  doctor_id: number
  issue_date: string | null
  expiry_date: string | null
  status: string
}

const FREQUENCY_TO_HOURS_MINUTES: Record<ReminderFrequency, Array<[number, number]>> = {
  ONCE_DAILY: [[8, 0]],
  TWICE_DAILY: [[8, 0], [20, 0]],
  THRICE_DAILY: [[8, 0], [14, 0], [20, 0]],
  FOUR_TIMES_DAILY: [[8, 0], [12, 0], [16, 0], [20, 0]],
  EVERY_6_HOURS: [[0, 0], [6, 0], [12, 0], [18, 0]],
  EVERY_8_HOURS: [[0, 0], [8, 0], [16, 0]],
  EVERY_12_HOURS: [[8, 0], [20, 0]],
  BEFORE_MEALS: [[7, 0], [12, 0], [18, 0]],
  AFTER_MEALS: [[8, 0], [13, 0], [19, 0]],
  WITH_MEALS: [[7, 30], [12, 30], [18, 30]],
  BEDTIME: [[21, 0]],
  AS_NEEDED: [],
}

function startOfDayUTC(d: Date): Date {
  const nd = new Date(d)
  nd.setUTCHours(0, 0, 0, 0)
  return nd
}

function buildScheduledDates(
  startDate: Date,
  durationDays: number,
  times: Array<[number, number]>,
): Date[] {
  const result: Date[] = []
  const base = startOfDayUTC(startDate)
  const days = Math.max(1, durationDays)
  for (let i = 0; i < days; i++) {
    const day = new Date(base)
    day.setUTCDate(day.getUTCDate() + i)
    for (const [h, m] of times) {
      const ts = new Date(day)
      ts.setUTCHours(h, m, 0, 0)
      result.push(ts)
    }
  }
  return result
}

export async function generateRemindersForPrescription(
  prescription_item_id: number,
  clientOverride?: SupabaseClient,
): Promise<GenerateRemindersResult> {
  const supabase = clientOverride ?? createServiceClient()
  const result: GenerateRemindersResult = {
    created: 0,
    skipped_duplicates: 0,
    prescription_item_id,
    patient_id: 0,
  }

  try {
    const { data: item, error: itemErr } = await supabase
      .from('prescription_items')
      .select('*')
      .eq('item_id', prescription_item_id)
      .maybeSingle()

    if (itemErr) throw itemErr
    if (!item) {
      result.error = `prescription_item ${prescription_item_id} not found`
      return result
    }
    const row = item as unknown as PrescriptionItemRow

    const { data: presc, error: prescErr } = await supabase
      .from('prescriptions')
      .select('prescription_id, patient_id, doctor_id, issue_date, expiry_date, status')
      .eq('prescription_id', row.prescription_id)
      .maybeSingle()

    if (prescErr) throw prescErr
    if (!presc) {
      result.error = `prescription ${row.prescription_id} not found`
      return result
    }
    const prescRow = presc as unknown as PrescriptionRow
    result.patient_id = prescRow.patient_id

    if (prescRow.status === 'CANCELLED' || prescRow.status === 'EXPIRED') {
      result.error = `prescription status is ${prescRow.status}, no reminders generated`
      return result
    }

    const freq = row.frequency as ReminderFrequency
    const times = FREQUENCY_TO_HOURS_MINUTES[freq] ?? []
    if (times.length === 0) {
      return result
    }

    let startDate: Date
    if (prescRow.issue_date) {
      startDate = new Date(prescRow.issue_date + 'T00:00:00Z')
      if (isNaN(startDate.getTime())) {
        startDate = new Date()
      }
    } else {
      startDate = new Date(row.created_at ?? Date.now())
    }

    const now = new Date()
    if (startDate > now) {
      // start from start_date as given
    }

    const durationDays = row.duration_days && row.duration_days > 0 ? row.duration_days : 7
    const scheduledDates = buildScheduledDates(startDate, durationDays, times)

    if (scheduledDates.length === 0) {
      return result
    }

    const rowsToInsert = scheduledDates.map((sd) => ({
      patient_id: prescRow.patient_id,
      prescription_item_id: row.item_id,
      medicine_name: row.medicine_name,
      dosage: row.dosage,
      scheduled_at: sd.toISOString(),
      status: 'PENDING' as const,
      retry_count: 0,
    }))

    let createdCount = 0
    const batchSize = 200
    for (let i = 0; i < rowsToInsert.length; i += batchSize) {
      const batch = rowsToInsert.slice(i, i + batchSize)
      const { error: insErr } = await supabase
        .from('medication_reminders')
        .insert(batch as unknown as Record<string, unknown>[])
        .select('reminder_id')

      if (insErr) {
        const pgErr = insErr as { code?: string; message?: string }
        if (pgErr.code === '23505') {
          // unique violation — some rows conflicted. Fall back to per-row upsert.
          for (const single of batch) {
            const { error: singleErr } = await supabase
              .from('medication_reminders')
              .insert(single as unknown as Record<string, unknown>)
            if (!singleErr) {
              createdCount++
            } else {
              const se = singleErr as { code?: string }
              if (se.code !== '23505') {
                throw singleErr
              }
            }
          }
        } else {
          throw insErr
        }
      } else {
        createdCount += batch.length
      }
    }

    const { count: existingCount, error: countErr } = await supabase
      .from('medication_reminders')
      .select('*', { count: 'exact', head: true })
      .eq('prescription_item_id', row.item_id)

    if (!countErr && existingCount !== null) {
      result.skipped_duplicates = Math.max(0, scheduledDates.length - createdCount)
    }
    result.created = createdCount
    return result
  } catch (err: unknown) {
    const e = err as { message?: string; code?: string }
    result.error = e.message ?? 'Unknown error generating reminders'
    return result
  }
}

export async function updateReminderStatus(
  params: {
    reminder_id: number
    status: Exclude<ReminderStatus, 'PENDING'>
    notification_id?: number
    last_error?: string
  },
  clientOverride?: SupabaseClient,
): Promise<UpdateReminderStatusResult> {
  const supabase = clientOverride ?? createServiceClient()
  const result: UpdateReminderStatusResult = {
    success: false,
    reminder_id: params.reminder_id,
    old_status: '',
    new_status: params.status,
  }

  try {
    const { data: existing, error: fetchErr } = await supabase
      .from('medication_reminders')
      .select('status, retry_count')
      .eq('reminder_id', params.reminder_id)
      .maybeSingle()

    if (fetchErr) throw fetchErr
    if (!existing) {
      result.error = `reminder ${params.reminder_id} not found`
      return result
    }
    result.old_status = (existing as { status: string }).status

    const updates: Record<string, unknown> = {
      status: params.status,
    }

    if (params.status === 'SENT' || params.status === 'DELIVERED') {
      updates.sent_at = new Date().toISOString()
    }
    if (params.status === 'FAILED') {
      updates.failed_at = new Date().toISOString()
      updates.retry_count = ((existing as { retry_count?: number }).retry_count ?? 0) + 1
    }
    if (params.last_error !== undefined) {
      updates.last_error = params.last_error
    }
    if (params.notification_id !== undefined) {
      updates.notification_id = params.notification_id
    }

    const { error: updErr } = await supabase
      .from('medication_reminders')
      .update(updates)
      .eq('reminder_id', params.reminder_id)

    if (updErr) throw updErr
    result.success = true
    return result
  } catch (err: unknown) {
    const e = err as { message?: string }
    result.error = e.message ?? 'Unknown error updating reminder status'
    return result
  }
}

interface MedicationReminderRow {
  reminder_id: number
  patient_id: number
  prescription_item_id: number
  medicine_name: string
  dosage: string
  scheduled_at: string
  status: string
  retry_count: number
}

interface PatientRow {
  patient_id: number
  user_id: string | null
  email: string | null
  first_name: string | null
  last_name: string | null
}

export async function sendMedicationReminder(
  reminder_id: number,
  clientOverride?: SupabaseClient,
): Promise<{ success: boolean; error?: string }> {
  const supabase = clientOverride ?? createServiceClient()
  try {
    const { data: reminder, error: rErr } = await supabase
      .from('medication_reminders')
      .select('*')
      .eq('reminder_id', reminder_id)
      .maybeSingle()

    if (rErr) return { success: false, error: rErr.message }
    if (!reminder) return { success: false, error: 'reminder not found' }
    const r = reminder as unknown as MedicationReminderRow

    const { data: patient, error: pErr } = await supabase
      .from('patients')
      .select('patient_id, user_id, users(first_name, last_name)')
      .eq('patient_id', r.patient_id)
      .maybeSingle()

    if (pErr || !patient) {
      return { success: false, error: pErr?.message ?? 'patient not found' }
    }
    const p = patient as any
    let email: string | null = null
    if (p.user_id) {
      const { data: authUser } = await supabase.auth.admin.getUserById(p.user_id)
      email = authUser?.user?.email ?? null
    }

    if (!email) {
      void updateReminderStatus(
        { reminder_id: r.reminder_id, status: 'FAILED', last_error: 'no patient email' },
        supabase,
      ).catch(() => {})
      return { success: false, error: 'no patient email' }
    }

    const patientName = [p.users?.first_name, p.users?.last_name].filter(Boolean).join(' ') || 'Patient'
    const { subject, body } = buildMedicationReminder({
      reminder_id: r.reminder_id,
      patient_name: patientName,
      medicine_name: r.medicine_name,
      dosage: r.dosage,
      scheduled_at: r.scheduled_at,
    })

    fireNotification({
      type: 'MEDICATION_REMINDER',
      channel: 'EMAIL',
      recipient: email,
      subject,
      body,
      user_id: p.user_id ?? undefined,
      patient_id: p.patient_id,
      reminder_id: r.reminder_id,
      dedupe_key: buildDedupeKey(['MEDICATION_REMINDER', r.reminder_id, 'EMAIL']),
    })

    void updateReminderStatus(
      { reminder_id: r.reminder_id, status: 'SENT' },
      supabase,
    ).catch(() => {})

    return { success: true }
  } catch (err: unknown) {
    const e = err as { message?: string }
    try {
      void updateReminderStatus(
        { reminder_id, status: 'FAILED', last_error: e.message ?? 'unknown' },
        supabase,
      ).catch(() => {})
    } catch {
      // swallow
    }
    return { success: false, error: e.message ?? 'unknown' }
  }
}

export async function sendDueMedicationReminders(
  opts?: { limit?: number; lookahead_minutes?: number },
  clientOverride?: SupabaseClient,
): Promise<{ sent: number; skipped: number; errors: string[] }> {
  const supabase = clientOverride ?? createServiceClient()
  const limit = opts?.limit ?? 500
  const lookaheadMs = (opts?.lookahead_minutes ?? 5) * 60 * 1000
  const errors: string[] = []
  let sent = 0
  let skipped = 0
  try {
    const now = new Date()
    const windowEnd = new Date(now.getTime() + lookaheadMs)
    const { data, error } = await supabase
      .from('medication_reminders')
      .select('reminder_id, scheduled_at, status')
      .in('status', ['PENDING', 'FAILED'])
      .lte('scheduled_at', windowEnd.toISOString())
      .gte('scheduled_at', new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString())
      .order('scheduled_at', { ascending: true })
      .limit(limit)

    if (error) {
      return { sent: 0, skipped: 0, errors: [error.message] }
    }
    const rows = (data ?? []) as Array<{
      reminder_id: number
      status: string
      retry_count?: number
    }>
    for (const r of rows) {
      if (r.status === 'FAILED' && (r.retry_count ?? 0) >= 3) {
        skipped++
        continue
      }
      const res = await sendMedicationReminder(r.reminder_id, supabase)
      if (res.success) sent++
      else {
        skipped++
        if (res.error) errors.push(res.error)
      }
    }
    return { sent, skipped, errors }
  } catch (err: unknown) {
    const e = err as { message?: string }
    return { sent, skipped, errors: [...errors, e.message ?? 'unknown'] }
  }
}
