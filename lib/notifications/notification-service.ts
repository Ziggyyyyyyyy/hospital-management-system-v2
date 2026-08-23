import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceClient } from '../../utils/supabase/service'
import { Resend } from 'resend'
import crypto from 'node:crypto'

export type NotificationChannel = 'EMAIL' | 'SMS' | 'PUSH' | 'IN_APP'
export type NotificationType =
  | 'BOOKING_CONFIRMATION'
  | 'APPOINTMENT_REMINDER'
  | 'APPOINTMENT_CANCELLATION'
  | 'APPOINTMENT_RESCHEDULE'
  | 'DOCTOR_LEAVE_CONFLICT'
  | 'MEDICATION_REMINDER'
  | 'PREVISIT_SUMMARY_READY'
  | 'POSTVISIT_SUMMARY_READY'
  | 'SYSTEM_ADMIN'

export type NotificationStatus =
  | 'PENDING'
  | 'QUEUED'
  | 'SENDING'
  | 'SENT'
  | 'DELIVERED'
  | 'FAILED'
  | 'CANCELLED'

export interface NotificationInput {
  user_id?: string | null
  patient_id?: number | null
  staff_id?: number | null
  appointment_id?: number | null
  reminder_id?: number | null
  type: NotificationType
  channel: NotificationChannel
  recipient: string
  subject?: string | null
  body?: string | null
  template_name?: string | null
  template_vars?: Record<string, unknown> | null
  scheduled_at?: string | null
  max_retries?: number
  dedupe_key?: string | null
}

export interface NotificationRow {
  notification_id: number
  status: NotificationStatus
  [key: string]: unknown
}

export interface SendNotificationResult {
  success: boolean
  notification_id?: number
  status: NotificationStatus
  channel: NotificationChannel
  error_message?: string
  provider?: string
  duplicate?: boolean
}

export interface RetryResult {
  notification_id: number
  attempted: boolean
  success: boolean
  previous_status: NotificationStatus
  new_status: NotificationStatus
  error?: string
}

export interface RetrySummary {
  total_attempted: number
  successful: number
  failed: number
  results: RetryResult[]
}

export interface EmailSendParams {
  to: string
  subject?: string
  body?: string
}

export interface EmailProvider {
  readonly name: string
  send(params: EmailSendParams): Promise<{
    success: boolean
    provider_message_id?: string
    error?: string
  }>
}

// ============================================================
// RESEND PROVIDER — production-ready
// ============================================================
export class ResendEmailProvider implements EmailProvider {
  readonly name = 'resend'
  private client: Resend | null = null
  private fromFallback = 'noreply@yourhospital.com'

  constructor(apiKey?: string) {
    const key = apiKey ?? process.env.RESEND_API_KEY
    if (key) {
      try {
        this.client = new Resend(key)
      } catch {
        this.client = null
      }
    }
    this.fromFallback = process.env.EMAIL_FROM ?? this.fromFallback
  }

  async send(params: EmailSendParams): Promise<{
    success: boolean
    provider_message_id?: string
    error?: string
  }> {
    if (!this.client) {
      return {
        success: false,
        error: 'Resend client not initialised (RESEND_API_KEY missing)',
      }
    }
    if (!params.to) {
      return { success: false, error: 'Recipient email (to) is required' }
    }
    try {
      const res = await this.client.emails.send({
        from: this.fromFallback,
        to: params.to,
        subject: params.subject ?? 'Hospital Notification',
        html: params.body
          ? this.wrapHtml(params.body)
          : '<p>Hospital notification.</p>',
      })
      if (res.error) {
        return {
          success: false,
          error:
            (res.error as { message?: string }).message ??
            String(res.error) ??
            'Resend send error',
        }
      }
      const id = (res.data as { id?: string } | null)?.id
      return { success: true, provider_message_id: id }
    } catch (err: unknown) {
      const e = err as { message?: string }
      return {
        success: false,
        error: e.message ?? 'Resend send threw an exception',
      }
    }
  }

  private wrapHtml(content: string): string {
    if (/<html|<body/i.test(content)) return content
    return `<!doctype html><html><body style="font-family:system-ui,Arial,sans-serif;line-height:1.5;color:#111;padding:20px">${content}</body></html>`
  }
}

// ============================================================
// STUB PROVIDER — fallback / dev
// ============================================================
export class StubEmailProvider implements EmailProvider {
  readonly name = 'stub'

  async send(params: EmailSendParams): Promise<{
    success: boolean
    provider_message_id?: string
    error?: string
  }> {
    if (!params.to) {
      return { success: false, error: 'Recipient email is required' }
    }
    return {
      success: true,
      provider_message_id: `stub-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    }
  }
}

let _emailProvider: EmailProvider | null = null

export function getEmailProvider(): EmailProvider {
  if (!_emailProvider) {
    const providerName = (process.env.EMAIL_PROVIDER ?? 'stub').toLowerCase()
    if (providerName === 'resend') {
      const key = process.env.RESEND_API_KEY
      if (key) {
        _emailProvider = new ResendEmailProvider(key)
      } else {
        _emailProvider = new StubEmailProvider()
      }
    } else {
      _emailProvider = new StubEmailProvider()
    }
  }
  return _emailProvider
}

export function setEmailProvider(provider: EmailProvider): void {
  _emailProvider = provider
}

// ============================================================
// DETERMINISTIC DEDUPE KEYS — prevent duplicate sends per event
// ============================================================
export function buildDedupeKey(parts: Array<string | number | null | undefined>): string {
  const joined = parts.map((p) => (p == null ? '' : String(p))).join('||')
  return 'ndk:' + crypto.createHash('sha256').update(joined).digest('hex').slice(0, 48)
}

// ============================================================
// EMAIL TEMPLATE BUILDERS — all 8 types
// ============================================================
const SITE_NAME = process.env.NEXT_PUBLIC_SITE_NAME ?? 'Hospital Management System'
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'

function fmtDateTime(iso: string | Date | null | undefined): string {
  if (!iso) return 'TBD'
  try {
    const d = new Date(iso)
    if (isNaN(d.getTime())) return String(iso)
    return d.toLocaleString()
  } catch {
    return String(iso)
  }
}

export interface BookingVars {
  appointment_id: number | string
  patient_name: string
  doctor_name: string
  department?: string
  start_time: string | Date
  reason_for_visit?: string | null
}

export function buildBookingConfirmation(v: BookingVars): { subject: string; body: string } {
  const subject = `Appointment Confirmed #${v.appointment_id} — ${SITE_NAME}`
  const body = `
<div>
  <h2 style="color:#0369a1">Appointment Confirmed</h2>
  <p>Dear ${v.patient_name}, your appointment has been successfully booked.</p>
  <table style="border-collapse:collapse;margin:16px 0">
    <tr><td style="padding:6px 12px;background:#f1f5f9"><strong>Appointment #</strong></td><td style="padding:6px 12px">${v.appointment_id}</td></tr>
    <tr><td style="padding:6px 12px;background:#f1f5f9"><strong>Doctor</strong></td><td style="padding:6px 12px">Dr. ${v.doctor_name}</td></tr>
    ${v.department ? `<tr><td style="padding:6px 12px;background:#f1f5f9"><strong>Department</strong></td><td style="padding:6px 12px">${v.department}</td></tr>` : ''}
    <tr><td style="padding:6px 12px;background:#f1f5f9"><strong>Date &amp; Time</strong></td><td style="padding:6px 12px">${fmtDateTime(v.start_time)}</td></tr>
    ${v.reason_for_visit ? `<tr><td style="padding:6px 12px;background:#f1f5f9"><strong>Reason</strong></td><td style="padding:6px 12px">${v.reason_for_visit}</td></tr>` : ''}
  </table>
  <p>You can view your appointments at <a href="${SITE_URL}/patient">${SITE_URL}/patient</a>.</p>
  <p style="color:#64748b;font-size:13px">Thank you,<br/>${SITE_NAME}</p>
</div>`
  return { subject, body }
}

export interface AppointmentReminderVars {
  appointment_id: number | string
  patient_name: string
  doctor_name: string
  department?: string
  reason_for_visit?: string | null
  start_time: string | Date
}

export function buildAppointmentReminder(v: AppointmentReminderVars): { subject: string; body: string } {
  const subject = `Reminder: Upcoming Appointment #${v.appointment_id}`
  const body = `
<div>
  <h2 style="color:#0891b2">Appointment Reminder</h2>
  <p>Hi ${v.patient_name}, this is a friendly reminder about your upcoming appointment:</p>
  <ul>
    <li><strong>Appointment #:</strong> ${v.appointment_id}</li>
    <li><strong>Doctor:</strong> Dr. ${v.doctor_name}</li>
    <li><strong>Date &amp; Time:</strong> ${fmtDateTime(v.start_time)}</li>
  </ul>
  <p>Please arrive 10 minutes early. To reschedule or cancel, visit <a href="${SITE_URL}/patient">your dashboard</a>.</p>
  <p style="color:#64748b;font-size:13px">— ${SITE_NAME}</p>
</div>`
  return { subject, body }
}

export interface CancellationVars {
  appointment_id: number | string
  patient_name: string
  doctor_name: string
  start_time: string | Date
  cancel_reason?: string | null
  cancel_reason_text?: string | null
}

export function buildAppointmentCancellation(v: CancellationVars): { subject: string; body: string } {
  const subject = `Appointment Cancelled #${v.appointment_id}`
  const why = v.cancel_reason_text ?? v.cancel_reason ?? 'Not specified'
  const body = `
<div>
  <h2 style="color:#dc2626">Appointment Cancelled</h2>
  <p>Dear ${v.patient_name}, your appointment has been cancelled.</p>
  <table style="border-collapse:collapse;margin:16px 0">
    <tr><td style="padding:6px 12px;background:#f1f5f9"><strong>Appointment #</strong></td><td style="padding:6px 12px">${v.appointment_id}</td></tr>
    <tr><td style="padding:6px 12px;background:#f1f5f9"><strong>Doctor</strong></td><td style="padding:6px 12px">Dr. ${v.doctor_name}</td></tr>
    <tr><td style="padding:6px 12px;background:#f1f5f9"><strong>Scheduled</strong></td><td style="padding:6px 12px">${fmtDateTime(v.start_time)}</td></tr>
    <tr><td style="padding:6px 12px;background:#f1f5f9"><strong>Reason</strong></td><td style="padding:6px 12px">${why}</td></tr>
  </table>
  <p>Book a new appointment at <a href="${SITE_URL}/patient">${SITE_URL}/patient</a>.</p>
  <p style="color:#64748b;font-size:13px">— ${SITE_NAME}</p>
</div>`
  return { subject, body }
}

export interface RescheduleVars {
  appointment_id: number | string
  previous_appointment_id?: number | string
  patient_name: string
  doctor_name: string
  new_start_time: string | Date
  old_start_time?: string | Date
}

export function buildAppointmentReschedule(v: RescheduleVars): { subject: string; body: string } {
  const subject = `Appointment Rescheduled #${v.appointment_id}`
  const body = `
<div>
  <h2 style="color:#7c3aed">Appointment Rescheduled</h2>
  <p>Hi ${v.patient_name}, your appointment has been rescheduled.</p>
  <table style="border-collapse:collapse;margin:16px 0">
    <tr><td style="padding:6px 12px;background:#f1f5f9"><strong>Appointment #</strong></td><td style="padding:6px 12px">${v.appointment_id}${v.previous_appointment_id ? ` (prev #${v.previous_appointment_id})` : ''}</td></tr>
    <tr><td style="padding:6px 12px;background:#f1f5f9"><strong>Doctor</strong></td><td style="padding:6px 12px">Dr. ${v.doctor_name}</td></tr>
    ${v.old_start_time ? `<tr><td style="padding:6px 12px;background:#f1f5f9"><strong>Previous Date</strong></td><td style="padding:6px 12px;text-decoration:line-through;color:#64748b">${fmtDateTime(v.old_start_time)}</td></tr>` : ''}
    <tr><td style="padding:6px 12px;background:#f1f5f9"><strong>New Date &amp; Time</strong></td><td style="padding:6px 12px;font-weight:600">${fmtDateTime(v.new_start_time)}</td></tr>
  </table>
  <p>Review the updated time at <a href="${SITE_URL}/patient">your dashboard</a>.</p>
  <p style="color:#64748b;font-size:13px">— ${SITE_NAME}</p>
</div>`
  return { subject, body }
}

export interface LeaveConflictVars {
  appointment_id: number | string
  patient_name: string
  doctor_name: string
  original_start_time: string | Date
  leave_start_date: string | Date
  leave_end_date: string | Date
  leave_reason?: string | null
}

export function buildDoctorLeaveConflict(v: LeaveConflictVars): { subject: string; body: string } {
  const subject = `Action Needed: Doctor Leave Conflict for Appointment #${v.appointment_id}`
  const body = `
<div>
  <h2 style="color:#b45309">Doctor Leave Conflict</h2>
  <p>Dear ${v.patient_name}, your appointment with Dr. ${v.doctor_name} conflicts with newly approved doctor leave and needs to be rescheduled.</p>
  <ul>
    <li><strong>Appointment #:</strong> ${v.appointment_id}</li>
    <li><strong>Original Date:</strong> ${fmtDateTime(v.original_start_time)}</li>
    <li><strong>Doctor on leave:</strong> ${fmtDateTime(v.leave_start_date)} – ${fmtDateTime(v.leave_end_date)}</li>
    ${v.leave_reason ? `<li><strong>Leave reason:</strong> ${v.leave_reason}</li>` : ''}
  </ul>
  <p>Please visit <a href="${SITE_URL}/patient">your dashboard</a> to pick a new slot. We apologise for the inconvenience.</p>
  <p style="color:#64748b;font-size:13px">— ${SITE_NAME}</p>
</div>`
  return { subject, body }
}

export interface MedicationReminderVars {
  patient_name: string
  medicine_name: string
  dosage: string
  scheduled_at: string | Date
  frequency?: string | null
  instructions?: string | null
  reminder_id?: number | string
}

export function buildMedicationReminder(v: MedicationReminderVars): { subject: string; body: string } {
  const subject = `Medication Reminder: ${v.medicine_name} (${v.dosage})`
  const body = `
<div>
  <h2 style="color:#059669">Medication Reminder</h2>
  <p>Hi ${v.patient_name}, it's time for your medication.</p>
  <table style="border-collapse:collapse;margin:16px 0">
    <tr><td style="padding:6px 12px;background:#f1f5f9"><strong>Medicine</strong></td><td style="padding:6px 12px">${v.medicine_name}</td></tr>
    <tr><td style="padding:6px 12px;background:#f1f5f9"><strong>Dosage</strong></td><td style="padding:6px 12px">${v.dosage}</td></tr>
    ${v.frequency ? `<tr><td style="padding:6px 12px;background:#f1f5f9"><strong>Frequency</strong></td><td style="padding:6px 12px">${v.frequency}</td></tr>` : ''}
    <tr><td style="padding:6px 12px;background:#f1f5f9"><strong>Scheduled</strong></td><td style="padding:6px 12px">${fmtDateTime(v.scheduled_at)}</td></tr>
    ${v.instructions ? `<tr><td style="padding:6px 12px;background:#f1f5f9"><strong>Instructions</strong></td><td style="padding:6px 12px">${v.instructions}</td></tr>` : ''}
  </table>
  <p style="color:#64748b;font-size:13px">Stay on track with your treatment.<br/>— ${SITE_NAME}</p>
</div>`
  return { subject, body }
}

export interface AiSummaryReadyVars {
  appointment_id: number | string
  patient_name: string
  summary_kind: 'Pre-Visit' | 'Post-Visit'
  generated_at?: string | Date
}

export function buildAiSummaryReady(v: AiSummaryReadyVars): { subject: string; body: string } {
  const subject = `${v.summary_kind} AI Summary Ready — Appointment #${v.appointment_id}`
  const body = `
<div>
  <h2 style="color:#0ea5e9">${v.summary_kind} AI Summary Ready</h2>
  <p>Dear ${v.patient_name}, the AI ${v.summary_kind.toLowerCase()} summary for appointment #${v.appointment_id} is now available${v.generated_at ? ` (generated ${fmtDateTime(v.generated_at)})` : ''}.</p>
  <p>Review it from <a href="${SITE_URL}/patient">your patient dashboard</a>.</p>
  <p style="color:#64748b;font-size:13px">Note: the doctor's clinical notes are always the authoritative record.</p>
  <p style="color:#64748b;font-size:13px">— ${SITE_NAME}</p>
</div>`
  return { subject, body }
}

// ============================================================
// PERSIST / STATUS HELPERS
// ============================================================
async function persistNotification(
  supabase: SupabaseClient,
  input: NotificationInput,
): Promise<{ notification_id?: number; error?: string; duplicate?: boolean }> {
  try {
    const row: Record<string, unknown> = {
      user_id: input.user_id ?? null,
      patient_id: input.patient_id ?? null,
      staff_id: input.staff_id ?? null,
      appointment_id: input.appointment_id ?? null,
      reminder_id: input.reminder_id ?? null,
      type: input.type,
      channel: input.channel,
      recipient: input.recipient,
      subject: input.subject ?? null,
      body: input.body ?? null,
      template_name: input.template_name ?? null,
      template_vars: input.template_vars ?? null,
      scheduled_at: input.scheduled_at ?? null,
      status: 'PENDING' as const,
      retry_count: 0,
      max_retries: input.max_retries ?? 3,
      dedupe_key: input.dedupe_key ?? null,
    }

    const { data, error } = await supabase
      .from('notifications')
      .insert(row)
      .select('notification_id')
      .maybeSingle()

    if (error) {
      if (error.code === '23505' && input.dedupe_key) {
        return { duplicate: true, error: 'Duplicate notification (dedupe_key match)' }
      }
      return { error: error.message ?? 'Failed to insert notification' }
    }
    if (!data) {
      return { error: 'No notification_id returned from insert' }
    }
    return { notification_id: (data as { notification_id: number }).notification_id }
  } catch (err: unknown) {
    const e = err as { message?: string }
    return { error: e.message ?? 'Unexpected error persisting notification' }
  }
}

async function markNotificationStatus(
  supabase: SupabaseClient,
  notification_id: number,
  status: NotificationStatus,
  fields?: {
    last_error?: string
    provider?: string
    provider_message_id?: string
  },
): Promise<void> {
  try {
    const updates: Record<string, unknown> = { status }
    const now = new Date().toISOString()
    if (status === 'SENT' || status === 'DELIVERED') {
      updates.sent_at = now
    }
    if (status === 'FAILED') {
      updates.failed_at = now
    }
    if (fields?.last_error !== undefined) {
      updates.last_error = fields.last_error
    }
    if (fields?.provider !== undefined) {
      updates.provider = fields.provider
    }
    if (fields?.provider_message_id !== undefined) {
      updates.provider_message_id = fields.provider_message_id
    }
    await supabase
      .from('notifications')
      .update(updates)
      .eq('notification_id', notification_id)
  } catch {
    // swallow — caller never throws
  }
}

async function deliverEmail(
  supabase: SupabaseClient,
  notification_id: number,
  input: NotificationInput,
): Promise<{
  success: boolean
  provider?: string
  error?: string
  provider_message_id?: string
}> {
  try {
    await markNotificationStatus(supabase, notification_id, 'SENDING')
    const provider = getEmailProvider()
    const result = await provider.send({
      to: input.recipient,
      subject: input.subject ?? undefined,
      body: input.body ?? undefined,
    })

    if (result.success) {
      await markNotificationStatus(supabase, notification_id, 'SENT', {
        provider: provider.name,
        provider_message_id: result.provider_message_id,
      })
      return { success: true, provider: provider.name, provider_message_id: result.provider_message_id }
    }

    await markNotificationStatus(supabase, notification_id, 'FAILED', {
      provider: provider.name,
      last_error: result.error ?? 'Email send failed without error message',
    })
    return { success: false, provider: provider.name, error: result.error }
  } catch (err: unknown) {
    const e = err as { message?: string }
    const msg = e.message ?? 'Unexpected email delivery threw an exception'
    try {
      await markNotificationStatus(supabase, notification_id, 'FAILED', { last_error: msg })
    } catch {
      // swallow
    }
    return { success: false, error: msg }
  }
}

export async function sendNotification(
  input: NotificationInput,
  clientOverride?: SupabaseClient,
): Promise<SendNotificationResult> {
  const supabase = clientOverride ?? createServiceClient()
  const fallback: SendNotificationResult = {
    success: false,
    status: 'FAILED',
    channel: input.channel,
    error_message: 'Unknown error',
  }

  try {
    const persisted = await persistNotification(supabase, input)
    if (persisted.duplicate) {
      return {
        success: true,
        status: 'SENT',
        channel: input.channel,
        duplicate: true,
      }
    }
    if (persisted.error && persisted.notification_id === undefined) {
      fallback.error_message = persisted.error
      return fallback
    }
    const notification_id = persisted.notification_id
    if (notification_id !== undefined) {
      fallback.notification_id = notification_id
    }

    if (input.scheduled_at && new Date(input.scheduled_at) > new Date()) {
      return {
        success: true,
        notification_id,
        status: 'PENDING',
        channel: input.channel,
      }
    }

    if (input.channel === 'EMAIL') {
      if (notification_id === undefined) {
        return {
          success: false,
          status: 'FAILED',
          channel: 'EMAIL',
          error_message: persisted.error ?? 'No notification id to deliver against',
        }
      }
      const delivered = await deliverEmail(supabase, notification_id, input)
      return {
        success: delivered.success,
        notification_id,
        status: delivered.success ? 'SENT' : 'FAILED',
        channel: 'EMAIL',
        error_message: delivered.error,
        provider: delivered.provider,
      }
    }

    const errMsg = `Channel ${input.channel} is not implemented`
    if (notification_id !== undefined) {
      try {
        await markNotificationStatus(supabase, notification_id, 'FAILED', { last_error: errMsg })
      } catch {
        // swallow
      }
    }
    return {
      success: false,
      notification_id,
      status: 'FAILED',
      channel: input.channel,
      error_message: errMsg,
    }
  } catch (err: unknown) {
    const e = err as { message?: string }
    fallback.error_message = e.message ?? 'sendNotification unexpected exception'
    return fallback
  }
}

// ============================================================
// FIRE-AND-FORGET wrapper — never blocks business operations
// ============================================================
export function fireNotification(input: NotificationInput): void {
  void sendNotification(input).catch(() => {
    // entirely silent — any status is persisted in the DB.
  })
}

export async function retryFailedNotifications(
  options?: {
    limit?: number
    types?: NotificationType[]
  },
  clientOverride?: SupabaseClient,
): Promise<RetrySummary> {
  const supabase = clientOverride ?? createServiceClient()
  const summary: RetrySummary = {
    total_attempted: 0,
    successful: 0,
    failed: 0,
    results: [],
  }

  try {
    let query = supabase
      .from('notifications')
      .select('*')
      .eq('status', 'FAILED')
      .order('created_at', { ascending: true })

    if (options?.types && options.types.length > 0) {
      query = query.in('type', options.types as unknown as string[])
    }
    if (options?.limit) {
      query = query.limit(options.limit)
    }

    const { data, error } = await query
    if (error) {
      return summary
    }
    const allRows = (data ?? []) as unknown as Array<{
      notification_id: number
      status: NotificationStatus
      retry_count: number
      max_retries: number
      channel: NotificationChannel
      type: NotificationType
      recipient: string
      subject: string | null
      body: string | null
      user_id: string | null
      patient_id: number | null
      staff_id: number | null
      appointment_id: number | null
      reminder_id: number | null
      template_name: string | null
      template_vars: Record<string, unknown> | null
      scheduled_at: string | null
    }>
    const rows = allRows.filter((r) => r.retry_count < r.max_retries)

    for (const row of rows) {
      summary.total_attempted++
      const result: RetryResult = {
        notification_id: row.notification_id,
        attempted: false,
        success: false,
        previous_status: row.status,
        new_status: row.status,
      }

      try {
        const { error: bumpError } = await supabase
          .from('notifications')
          .update({
            status: 'QUEUED',
            retry_count: row.retry_count + 1,
            last_error: null,
            failed_at: null,
          })
          .eq('notification_id', row.notification_id)
        if (bumpError) {
          result.error = bumpError.message
          summary.failed++
          summary.results.push(result)
          continue
        }

        result.attempted = true
        const input: NotificationInput = {
          user_id: row.user_id,
          patient_id: row.patient_id,
          staff_id: row.staff_id,
          appointment_id: row.appointment_id,
          reminder_id: row.reminder_id,
          type: row.type,
          channel: row.channel,
          recipient: row.recipient,
          subject: row.subject,
          body: row.body,
          template_name: row.template_name,
          template_vars: row.template_vars,
          scheduled_at: row.scheduled_at,
          max_retries: row.max_retries,
        }

        if (row.channel === 'EMAIL') {
          const delivered = await deliverEmail(supabase, row.notification_id, input)
          result.success = delivered.success
          result.new_status = delivered.success ? 'SENT' : 'FAILED'
          result.error = delivered.error
        } else {
          const errMsg = `Channel ${row.channel} not implemented for retry`
          result.error = errMsg
          result.new_status = 'FAILED'
          try {
            await markNotificationStatus(supabase, row.notification_id, 'FAILED', {
              last_error: errMsg,
            })
          } catch {
            // swallow
          }
        }

        if (result.success) {
          summary.successful++
        } else {
          summary.failed++
        }
      } catch (err: unknown) {
        const e = err as { message?: string }
        result.error = e.message ?? 'Unexpected retry error'
        result.new_status = 'FAILED'
        summary.failed++
      }

      summary.results.push(result)
    }

    return summary
  } catch {
    return summary
  }
}
