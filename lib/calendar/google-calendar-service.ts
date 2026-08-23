import { createServiceClientRaw } from '../../utils/supabase/service'

export type CalendarSyncStatus = 'PENDING' | 'SYNCING' | 'SYNCED' | 'FAILED' | 'CANCELLED' | 'UPDATED'

export interface AppointmentForCalendar {
  appointment_id: number
  patient_id: number
  doctor_id: number
  reason_for_visit?: string | null
  start_time: string | Date
  end_time: string | Date
  timezone?: string
}

export interface CalendarEventInput {
  appointment: AppointmentForCalendar
  patient_email: string
  doctor_email: string
  patient_name?: string
  doctor_name?: string
  department?: string
}

export interface AuthUrlResult {
  success: boolean
  auth_url?: string
  error?: string
}

export interface TokenExchangeResult {
  success: boolean
  access_token?: string
  refresh_token?: string
  expires_at?: Date
  scope?: string
  error?: string
}

export interface CalendarOpResult {
  status: CalendarSyncStatus
  google_event_id?: string
  error?: string
}

export interface StoreTokensResult {
  success: boolean
  error?: string
}

export interface GetStoredTokensResult {
  success: boolean
  access_token?: string
  refresh_token?: string
  expires_at?: Date
  scope?: string
  error?: string
}

export interface RefreshTokenResult {
  success: boolean
  access_token?: string
  expires_at?: Date
  error?: string
}

import { encryptSecret, decryptSecret, isEncryptedSecret } from '../crypto/vault'

const GOOGLE_CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar'
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const GOOGLE_CALENDAR_API_URL = 'https://www.googleapis.com/calendar/v3/calendars'

const BASE64_SECRET_SALT =
  process.env.ENCRYPTION_SALT ?? 'hospital-mgmt-calendar-salt-placeholder-v1'

/**
 * Legacy decrypt helper for graceful migration of any pre-existing reversed-base64 tokens.
 */
function legacyDecrypt(cipher: string): string {
  try {
    const reversed = cipher.split('').reverse().join('')
    const salted = Buffer.from(reversed, 'base64').toString('utf8')
    const sep = salted.indexOf('::')
    if (sep >= 0) {
      return salted.slice(sep + 2)
    }
    return Buffer.from(cipher.split('').reverse().join(''), 'base64').toString('utf8')
  } catch {
    try {
      return Buffer.from(cipher.split('').reverse().join(''), 'base64').toString('utf8')
    } catch {
      return ''
    }
  }
}

function decryptToken(cipher: string): string {
  if (!cipher) return ''
  if (isEncryptedSecret(cipher)) {
    return decryptSecret(cipher)
  }
  return legacyDecrypt(cipher)
}

function getEnvConfig() {
  return {
    clientId: process.env.GOOGLE_CLIENT_ID ?? '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
    redirectUri: process.env.GOOGLE_REDIRECT_URI ?? '',
  }
}

function isConfigValid(): boolean {
  const c = getEnvConfig()
  return Boolean(c.clientId && c.clientSecret && c.redirectUri)
}

function toISO(val: string | Date): string {
  if (val instanceof Date) return val.toISOString()
  const d = new Date(val)
  return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString()
}

export function generateAuthUrl(options?: { state?: string }): AuthUrlResult {
  try {
    const cfg = getEnvConfig()
    if (!cfg.clientId || !cfg.redirectUri) {
      return {
        success: false,
        error: 'GOOGLE_CLIENT_ID and GOOGLE_REDIRECT_URI must be configured',
      }
    }
    const params = new URLSearchParams({
      client_id: cfg.clientId,
      redirect_uri: cfg.redirectUri,
      response_type: 'code',
      scope: GOOGLE_CALENDAR_SCOPE,
      access_type: 'offline',
      prompt: 'consent',
      include_granted_scopes: 'true',
    })
    if (options?.state) {
      params.set('state', options.state)
    }
    return {
      success: true,
      auth_url: `${GOOGLE_AUTH_URL}?${params.toString()}`,
    }
  } catch (err: unknown) {
    const e = err as { message?: string }
    return { success: false, error: e.message ?? 'Failed to generate auth URL' }
  }
}

export async function exchangeCodeForTokens(code: string): Promise<TokenExchangeResult> {
  try {
    const cfg = getEnvConfig()
    if (!cfg.clientId || !cfg.clientSecret || !cfg.redirectUri) {
      return {
        success: false,
        error: 'Google OAuth env vars not configured',
      }
    }
    if (!code) {
      return { success: false, error: 'Authorization code is required' }
    }
    const body = new URLSearchParams({
      code,
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      redirect_uri: cfg.redirectUri,
      grant_type: 'authorization_code',
    })
    const resp = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: body.toString(),
    })
    const json = (await resp.json().catch(() => ({}))) as Record<string, unknown>
    if (!resp.ok) {
      return {
        success: false,
        error:
          (json.error_description as string) ??
          (json.error as string) ??
          `Token exchange failed with HTTP ${resp.status}`,
      }
    }
    const access_token = json.access_token as string | undefined
    const refresh_token = json.refresh_token as string | undefined
    const expires_in = Number(json.expires_in ?? 0)
    if (!access_token) {
      return { success: false, error: 'Token response missing access_token' }
    }
    return {
      success: true,
      access_token,
      refresh_token,
      scope: (json.scope as string) ?? GOOGLE_CALENDAR_SCOPE,
      expires_at: expires_in > 0 ? new Date(Date.now() + expires_in * 1000) : undefined,
    }
  } catch (err: unknown) {
    const e = err as { message?: string }
    return { success: false, error: e.message ?? 'Token exchange threw an exception' }
  }
}

export async function refreshAccessToken(refresh_token: string): Promise<RefreshTokenResult> {
  try {
    const cfg = getEnvConfig()
    if (!cfg.clientId || !cfg.clientSecret) {
      return { success: false, error: 'Google OAuth env vars not configured' }
    }
    if (!refresh_token) {
      return { success: false, error: 'Refresh token is required' }
    }
    const body = new URLSearchParams({
      refresh_token,
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      grant_type: 'refresh_token',
    })
    const resp = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: body.toString(),
    })
    const json = (await resp.json().catch(() => ({}))) as Record<string, unknown>
    if (!resp.ok) {
      return {
        success: false,
        error:
          (json.error_description as string) ??
          (json.error as string) ??
          `Token refresh failed with HTTP ${resp.status}`,
      }
    }
    const access_token = json.access_token as string | undefined
    const expires_in = Number(json.expires_in ?? 0)
    if (!access_token) {
      return { success: false, error: 'Refresh response missing access_token' }
    }
    return {
      success: true,
      access_token,
      expires_at: expires_in > 0 ? new Date(Date.now() + expires_in * 1000) : undefined,
    }
  } catch (err: unknown) {
    const e = err as { message?: string }
    return { success: false, error: e.message ?? 'Refresh threw an exception' }
  }
}

export async function storeUserTokens(
  params: {
    user_id: string
    access_token: string
    refresh_token?: string | null
    expires_at?: Date | null
    scope?: string
  },
): Promise<StoreTokensResult> {
  try {
    const supabase = createServiceClientRaw()
    const payload: Record<string, unknown> = {
      user_id: params.user_id,
      provider: 'google_calendar',
      scope: params.scope ?? GOOGLE_CALENDAR_SCOPE,
      access_token_cipher: encryptSecret(params.access_token),
      refresh_token_cipher: encryptSecret(params.refresh_token ?? ''),
    }
    if (params.expires_at) {
      payload.expires_at = new Date(params.expires_at).toISOString()
    }
    const { error } = await supabase
      .from('user_oauth_tokens')
      .upsert(payload, { onConflict: 'user_id, provider' })
    if (error) {
      return { success: false, error: error.message ?? 'Failed to store tokens' }
    }
    return { success: true }
  } catch (err: unknown) {
    const e = err as { message?: string }
    return { success: false, error: e.message ?? 'Failed to store tokens (exception)' }
  }
}

export async function getUserTokens(user_id: string): Promise<GetStoredTokensResult> {
  try {
    const supabase = createServiceClientRaw()
    const { data, error } = await supabase
      .from('user_oauth_tokens')
      .select('*')
      .eq('user_id', user_id)
      .eq('provider', 'google_calendar')
      .maybeSingle()

    if (error) {
      return { success: false, error: error.message }
    }
    if (!data) {
      return { success: false, error: 'No stored tokens for user' }
    }
    const row = data as Record<string, unknown>
    const access_token = decryptToken(String(row.access_token_cipher ?? ''))
    const refresh_token = decryptToken(String(row.refresh_token_cipher ?? ''))
    const expiresAtRaw = row.expires_at as string | null | undefined
    return {
      success: true,
      access_token: access_token || undefined,
      refresh_token: refresh_token || undefined,
      scope: (row.scope as string) ?? GOOGLE_CALENDAR_SCOPE,
      expires_at: expiresAtRaw ? new Date(expiresAtRaw) : undefined,
    }
  } catch (err: unknown) {
    const e = err as { message?: string }
    return { success: false, error: e.message ?? 'Failed to read stored tokens' }
  }
}

// Get a valid access token for a user, transparently refreshing if expired
// (within 2 min safety window) and persisting the new token back.
export async function getValidAccessToken(
  user_id: string,
): Promise<{ success: boolean; access_token?: string; error?: string }> {
  const stored = await getUserTokens(user_id)
  if (!stored.success || !stored.access_token) {
    return { success: false, error: stored.error ?? 'No stored tokens' }
  }

  const needsRefresh =
    !stored.expires_at || stored.expires_at.getTime() - Date.now() < 2 * 60 * 1000

  if (!needsRefresh) {
    return { success: true, access_token: stored.access_token }
  }

  if (!stored.refresh_token) {
    return {
      success: false,
      error: 'Access token expired and no refresh token available',
    }
  }

  const refreshed = await refreshAccessToken(stored.refresh_token)
  if (!refreshed.success || !refreshed.access_token) {
    return { success: false, error: refreshed.error ?? 'Token refresh failed' }
  }

  const update = await storeUserTokens({
    user_id,
    access_token: refreshed.access_token,
    refresh_token: stored.refresh_token,
    expires_at: refreshed.expires_at ?? null,
    scope: stored.scope,
  })

  if (!update.success) {
    return { success: true, access_token: refreshed.access_token }
  }

  return { success: true, access_token: refreshed.access_token }
}

async function ensureCalendarEventRowExists(
  params: {
    appointment_id: number
    patient_email: string
    doctor_email: string
    summary: string
    description: string
    start_time: string
    end_time: string
  },
): Promise<{ event_id?: number; error?: string }> {
  try {
    const supabase = createServiceClientRaw()
    const payload = {
      appointment_id: params.appointment_id,
      patient_email: params.patient_email,
      doctor_email: params.doctor_email,
      summary: params.summary,
      description: params.description,
      start_time: params.start_time,
      end_time: params.end_time,
    }
    const { data, error } = await supabase
      .from('calendar_events')
      .upsert(payload, { onConflict: 'appointment_id' })
      .select('event_id')
      .maybeSingle()
    if (error) {
      return { error: error.message }
    }
    const id = data ? (data as { event_id: number }).event_id : undefined
    return { event_id: id }
  } catch (err: unknown) {
    const e = err as { message?: string }
    return { error: e.message ?? 'calendar_events upsert exception' }
  }
}

async function updateCalendarEventSyncState(
  appointment_id: number,
  side: 'patient' | 'doctor' | 'both',
  status: CalendarSyncStatus,
  opts?: { google_event_id?: string; error?: string },
): Promise<void> {
  try {
    const supabase = createServiceClientRaw()
    const updates: Record<string, unknown> = {
      last_sync_at: new Date().toISOString(),
    }
    if (side === 'patient' || side === 'both') {
      updates.patient_status = status
      if (opts?.error !== undefined) updates.patient_error = opts.error
    }
    if (side === 'doctor' || side === 'both') {
      updates.doctor_status = status
      if (opts?.error !== undefined) updates.doctor_error = opts.error
    }
    if (opts?.google_event_id !== undefined) {
      updates.google_event_id = opts.google_event_id
    }
    await supabase
      .from('calendar_events')
      .update(updates)
      .eq('appointment_id', appointment_id)
  } catch {
    // swallow — never break the appointment flow
  }
}

async function incrementSyncAttempts(appointment_id: number): Promise<void> {
  try {
    const supabase = createServiceClientRaw()
    const { data, error } = await supabase
      .from('calendar_events')
      .select('sync_attempts')
      .eq('appointment_id', appointment_id)
      .maybeSingle()
    if (error || !data) return
    const attempts = (data as { sync_attempts: number }).sync_attempts
    await supabase
      .from('calendar_events')
      .update({ sync_attempts: attempts + 1 })
      .eq('appointment_id', appointment_id)
  } catch {
    // swallow
  }
}

function buildCalendarEvent(input: CalendarEventInput): {
  summary: string
  description: string
  start: { dateTime: string; timeZone: string }
  end: { dateTime: string; timeZone: string }
  attendees: Array<{ email: string; displayName?: string }>
} {
  const tz = input.appointment.timezone ?? 'UTC'
  const patientName = input.patient_name ?? input.patient_email
  const doctorName = input.doctor_name ?? input.doctor_email
  const summary = input.department
    ? `Appointment: ${patientName} with Dr. ${doctorName} (${input.department})`
    : `Appointment: ${patientName} with Dr. ${doctorName}`
  const lines: string[] = []
  lines.push(`Hospital Appointment #${input.appointment.appointment_id}`)
  lines.push(`Patient: ${patientName} <${input.patient_email}>`)
  lines.push(`Doctor: Dr. ${doctorName} <${input.doctor_email}>`)
  if (input.appointment.reason_for_visit) {
    lines.push(`Reason: ${input.appointment.reason_for_visit}`)
  }
  return {
    summary,
    description: lines.join('\n'),
    start: { dateTime: toISO(input.appointment.start_time), timeZone: tz },
    end: { dateTime: toISO(input.appointment.end_time), timeZone: tz },
    attendees: [
      { email: input.patient_email, displayName: patientName },
      { email: input.doctor_email, displayName: doctorName },
    ],
  }
}

async function createGoogleEventRequest(
  access_token: string,
  payload: ReturnType<typeof buildCalendarEvent>,
): Promise<{ success: boolean; google_event_id?: string; error?: string }> {
  try {
    if (!isConfigValid()) {
      return { success: false, error: 'Google OAuth env vars not configured' }
    }
    const resp = await fetch(`${GOOGLE_CALENDAR_API_URL}/primary/events?sendUpdates=all`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${access_token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
    })
    const json = (await resp.json().catch(() => ({}))) as Record<string, unknown>
    if (!resp.ok) {
      return {
        success: false,
        error:
          (json.error as { message?: string })?.message ??
          (json.error as string) ??
          `Google Calendar create failed HTTP ${resp.status}`,
      }
    }
    return { success: true, google_event_id: json.id as string | undefined }
  } catch (err: unknown) {
    const e = err as { message?: string }
    return { success: false, error: e.message ?? 'Google Calendar create threw exception' }
  }
}

async function updateGoogleEventRequest(
  access_token: string,
  google_event_id: string,
  payload: ReturnType<typeof buildCalendarEvent>,
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!isConfigValid()) {
      return { success: false, error: 'Google OAuth env vars not configured' }
    }
    const resp = await fetch(
      `${GOOGLE_CALENDAR_API_URL}/primary/events/${encodeURIComponent(google_event_id)}?sendUpdates=all`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${access_token}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(payload),
      },
    )
    const json = (await resp.json().catch(() => ({}))) as Record<string, unknown>
    if (!resp.ok) {
      return {
        success: false,
        error:
          (json.error as { message?: string })?.message ??
          (json.error as string) ??
          `Google Calendar update failed HTTP ${resp.status}`,
      }
    }
    return { success: true }
  } catch (err: unknown) {
    const e = err as { message?: string }
    return { success: false, error: e.message ?? 'Google Calendar update threw exception' }
  }
}

async function deleteGoogleEventRequest(
  access_token: string,
  google_event_id: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!isConfigValid()) {
      return { success: false, error: 'Google OAuth env vars not configured' }
    }
    const resp = await fetch(
      `${GOOGLE_CALENDAR_API_URL}/primary/events/${encodeURIComponent(google_event_id)}?sendUpdates=all`,
      {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${access_token}`,
          Accept: 'application/json',
        },
      },
    )
    if (!resp.ok) {
      if (resp.status === 410 || resp.status === 404) {
        return { success: true }
      }
      let msg: string | undefined
      try {
        const json = (await resp.json()) as Record<string, unknown>
        msg = (json.error as { message?: string })?.message ?? (json.error as string)
      } catch {
        // ignore parse error
      }
      return {
        success: false,
        error: msg ?? `Google Calendar delete failed HTTP ${resp.status}`,
      }
    }
    return { success: true }
  } catch (err: unknown) {
    const e = err as { message?: string }
    return { success: false, error: e.message ?? 'Google Calendar delete threw exception' }
  }
}

async function resolveDoctorUserId(
  doctor_id: number,
): Promise<{ user_id?: string; error?: string }> {
  try {
    const supabase = createServiceClientRaw()
    const { data, error } = await supabase
      .from('medical_staff')
      .select('user_id')
      .eq('staff_id', doctor_id)
      .maybeSingle()
    if (error) return { error: error.message }
    if (!data) return { error: 'Doctor not found' }
    return { user_id: (data as { user_id: string }).user_id }
  } catch (err: unknown) {
    const e = err as { message?: string }
    return { error: e.message ?? 'Doctor user_id lookup failed' }
  }
}

export async function createEvent(input: CalendarEventInput): Promise<CalendarOpResult> {
  try {
    const eventPayload = buildCalendarEvent(input)

    const rowResult = await ensureCalendarEventRowExists({
      appointment_id: input.appointment.appointment_id,
      patient_email: input.patient_email,
      doctor_email: input.doctor_email,
      summary: eventPayload.summary,
      description: eventPayload.description,
      start_time: toISO(input.appointment.start_time),
      end_time: toISO(input.appointment.end_time),
    })
    if (rowResult.error || rowResult.event_id === undefined) {
      return { status: 'FAILED', error: rowResult.error ?? 'calendar_events row creation failed' }
    }

    void incrementSyncAttempts(input.appointment.appointment_id)

    if (!isConfigValid()) {
      await updateCalendarEventSyncState(
        input.appointment.appointment_id,
        'both',
        'FAILED',
        { error: 'Google OAuth env vars not configured' },
      )
      return { status: 'FAILED', error: 'Google OAuth env vars not configured' }
    }

    await updateCalendarEventSyncState(
      input.appointment.appointment_id,
      'both',
      'SYNCING',
    )

    const userLookup = await resolveDoctorUserId(input.appointment.doctor_id)
    if (!userLookup.user_id) {
      await updateCalendarEventSyncState(
        input.appointment.appointment_id,
        'both',
        'FAILED',
        { error: userLookup.error ?? 'No doctor user_id' },
      )
      return { status: 'FAILED', error: userLookup.error ?? 'No doctor user_id' }
    }

    const tokens = await getValidAccessToken(userLookup.user_id)
    if (!tokens.success || !tokens.access_token) {
      await updateCalendarEventSyncState(
        input.appointment.appointment_id,
        'both',
        'FAILED',
        { error: tokens.error ?? 'No valid Google access token' },
      )
      return { status: 'FAILED', error: tokens.error ?? 'No valid Google access token' }
    }

    const created = await createGoogleEventRequest(tokens.access_token, eventPayload)
    if (!created.success) {
      await updateCalendarEventSyncState(
        input.appointment.appointment_id,
        'both',
        'FAILED',
        { error: created.error },
      )
      return { status: 'FAILED', error: created.error }
    }

    await updateCalendarEventSyncState(
      input.appointment.appointment_id,
      'both',
      'SYNCED',
      { google_event_id: created.google_event_id },
    )
    return {
      status: 'SYNCED',
      google_event_id: created.google_event_id,
    }
  } catch (err: unknown) {
    const e = err as { message?: string }
    try {
      await updateCalendarEventSyncState(
        input.appointment.appointment_id,
        'both',
        'FAILED',
        { error: e.message ?? 'Unknown error in createEvent' },
      )
    } catch {
      // swallow
    }
    return { status: 'FAILED', error: e.message ?? 'Unknown error in createEvent' }
  }
}

export async function updateEvent(input: CalendarEventInput): Promise<CalendarOpResult> {
  try {
    const eventPayload = buildCalendarEvent(input)

    const supabase = createServiceClientRaw()
    const { data: existing, error: existingErr } = await supabase
      .from('calendar_events')
      .select('event_id, google_event_id, patient_status, doctor_status')
      .eq('appointment_id', input.appointment.appointment_id)
      .maybeSingle()

    if (existingErr || !existing) {
      return await createEvent(input)
    }

    const row = existing as Record<string, unknown>
    const google_event_id = row.google_event_id as string | undefined

    await ensureCalendarEventRowExists({
      appointment_id: input.appointment.appointment_id,
      patient_email: input.patient_email,
      doctor_email: input.doctor_email,
      summary: eventPayload.summary,
      description: eventPayload.description,
      start_time: toISO(input.appointment.start_time),
      end_time: toISO(input.appointment.end_time),
    })

    void incrementSyncAttempts(input.appointment.appointment_id)

    if (!google_event_id) {
      return await createEvent(input)
    }

    if (!isConfigValid()) {
      await updateCalendarEventSyncState(
        input.appointment.appointment_id,
        'both',
        'FAILED',
        { error: 'Google OAuth env vars not configured' },
      )
      return { status: 'FAILED', error: 'Google OAuth env vars not configured' }
    }

    await updateCalendarEventSyncState(
      input.appointment.appointment_id,
      'both',
      'SYNCING',
    )

    const userLookup = await resolveDoctorUserId(input.appointment.doctor_id)
    if (!userLookup.user_id) {
      await updateCalendarEventSyncState(
        input.appointment.appointment_id,
        'both',
        'FAILED',
        { error: userLookup.error ?? 'No doctor user_id' },
      )
      return { status: 'FAILED', error: userLookup.error ?? 'No doctor user_id' }
    }

    const tokens = await getValidAccessToken(userLookup.user_id)
    if (!tokens.success || !tokens.access_token) {
      await updateCalendarEventSyncState(
        input.appointment.appointment_id,
        'both',
        'FAILED',
        { error: tokens.error ?? 'No valid Google access token' },
      )
      return { status: 'FAILED', error: tokens.error ?? 'No valid Google access token' }
    }

    const updated = await updateGoogleEventRequest(tokens.access_token, google_event_id, eventPayload)
    if (!updated.success) {
      await updateCalendarEventSyncState(
        input.appointment.appointment_id,
        'both',
        'FAILED',
        { error: updated.error },
      )
      return { status: 'FAILED', error: updated.error }
    }

    await updateCalendarEventSyncState(
      input.appointment.appointment_id,
      'both',
      'UPDATED',
    )
    return { status: 'UPDATED', google_event_id }
  } catch (err: unknown) {
    const e = err as { message?: string }
    try {
      await updateCalendarEventSyncState(
        input.appointment.appointment_id,
        'both',
        'FAILED',
        { error: e.message ?? 'Unknown error in updateEvent' },
      )
    } catch {
      // swallow
    }
    return { status: 'FAILED', error: e.message ?? 'Unknown error in updateEvent' }
  }
}

export async function deleteEvent(params: {
  appointment_id: number
  doctor_id: number
}): Promise<CalendarOpResult> {
  try {
    const supabase = createServiceClientRaw()
    const { data: existing, error: existingErr } = await supabase
      .from('calendar_events')
      .select('google_event_id')
      .eq('appointment_id', params.appointment_id)
      .maybeSingle()

    if (existingErr || !existing) {
      return { status: 'CANCELLED' }
    }
    const google_event_id = (existing as { google_event_id?: string }).google_event_id

    void incrementSyncAttempts(params.appointment_id)

    if (!google_event_id) {
      await updateCalendarEventSyncState(params.appointment_id, 'both', 'CANCELLED')
      return { status: 'CANCELLED' }
    }

    if (!isConfigValid()) {
      await updateCalendarEventSyncState(params.appointment_id, 'both', 'FAILED', {
        error: 'Google OAuth env vars not configured',
      })
      return { status: 'FAILED', error: 'Google OAuth env vars not configured' }
    }

    const userLookup = await resolveDoctorUserId(params.doctor_id)
    if (!userLookup.user_id) {
      await updateCalendarEventSyncState(
        params.appointment_id,
        'both',
        'FAILED',
        { error: userLookup.error ?? 'No doctor user_id' },
      )
      return { status: 'FAILED', error: userLookup.error ?? 'No doctor user_id' }
    }

    const tokens = await getValidAccessToken(userLookup.user_id)
    if (!tokens.success || !tokens.access_token) {
      await updateCalendarEventSyncState(
        params.appointment_id,
        'both',
        'FAILED',
        { error: tokens.error ?? 'No valid Google access token' },
      )
      return { status: 'FAILED', error: tokens.error ?? 'No valid Google access token' }
    }

    const deleted = await deleteGoogleEventRequest(tokens.access_token, google_event_id)
    if (!deleted.success) {
      await updateCalendarEventSyncState(params.appointment_id, 'both', 'FAILED', {
        error: deleted.error,
      })
      return { status: 'FAILED', error: deleted.error }
    }

    await updateCalendarEventSyncState(params.appointment_id, 'both', 'CANCELLED')
    return { status: 'CANCELLED', google_event_id }
  } catch (err: unknown) {
    const e = err as { message?: string }
    try {
      await updateCalendarEventSyncState(params.appointment_id, 'both', 'FAILED', {
        error: e.message ?? 'Unknown error in deleteEvent',
      })
    } catch {
      // swallow
    }
    return { status: 'FAILED', error: e.message ?? 'Unknown error in deleteEvent' }
  }
}

export function fireCalendarCreate(input: CalendarEventInput): void {
  void createEvent(input).catch(() => {
    // silently — status persisted in calendar_events row
  })
}

export function fireCalendarUpdate(input: CalendarEventInput): void {
  void updateEvent(input).catch(() => {
    // silently
  })
}

export function fireCalendarDelete(params: { appointment_id: number; doctor_id: number }): void {
  void deleteEvent(params).catch(() => {
    // silently
  })
}
