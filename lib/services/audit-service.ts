import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceClientRaw } from '../../utils/supabase/service'

export type AuditAction =
  | 'AUTH_LOGIN'
  | 'AUTH_LOGOUT'
  | 'AUTH_REGISTER'
  | 'AUTH_PASSWORD_RESET'
  | 'READ_PATIENT_RECORD'
  | 'CREATE_MEDICAL_RECORD'
  | 'UPDATE_MEDICAL_RECORD'
  | 'DELETE_MEDICAL_RECORD'
  | 'DISPENSE_MEDICINE'
  | 'UPDATE_MEDICINE_STOCK'
  | 'CONFIRM_BOOKING'
  | 'CANCEL_APPOINTMENT'
  | 'RESCHEDULE_APPOINTMENT'
  | 'CREATE_BILL'
  | 'UPDATE_BILL'
  | 'ADD_BILL_ITEM'
  | 'ASSIGN_NURSE'
  | 'CREATE_STAFF'
  | 'UPDATE_STAFF'
  | 'EXPORT_DATA'
  | 'AI_INTAKE_GENERATE'
  | 'AI_POSTVISIT_GENERATE'
  | 'SYSTEM_EVENT'

export type AuditResourceType =
  | 'auth'
  | 'users'
  | 'patients'
  | 'medical_records'
  | 'appointments'
  | 'prescriptions'
  | 'medicine_stock'
  | 'medicine_dispense'
  | 'billing'
  | 'billing_items'
  | 'medical_staff'
  | 'admissions'
  | 'notifications'
  | 'calendar'
  | 'ai'
  | 'system'

export interface AuditLogInput {
  actor_user_id?: string | null
  actor_role: string
  action: AuditAction
  resource_type: AuditResourceType
  resource_id?: string | number | null
  diff_payload?: Record<string, unknown> | null
  ip_address?: string | null
  user_agent?: string | null
}

export interface AuditLogRow {
  log_id: number
  actor_user_id: string | null
  actor_role: string
  action: string
  resource_type: string
  resource_id: string | null
  diff_payload: Record<string, unknown> | null
  ip_address: string | null
  user_agent: string | null
  created_at: string
}

export interface RecordAuditResult {
  success: boolean
  log_id?: number
  error?: string
}

/**
 * Records an immutable audit log entry.
 * Uses service role to ensure consistent recording regardless of client context.
 */
export async function recordAuditLog(
  input: AuditLogInput,
  clientOverride?: SupabaseClient,
): Promise<RecordAuditResult> {
  const supabase = clientOverride ?? createServiceClientRaw()

  try {
    const payload = {
      actor_user_id: input.actor_user_id ?? null,
      actor_role: input.actor_role,
      action: input.action,
      resource_type: input.resource_type,
      resource_id: input.resource_id != null ? String(input.resource_id) : null,
      diff_payload: input.diff_payload ?? null,
      ip_address: input.ip_address ?? null,
      user_agent: input.user_agent ?? null,
    }

    const { data, error } = await supabase
      .from('audit_logs')
      .insert([payload])
      .select('log_id')
      .single()

    if (error) {
      console.error('[audit-service] Failed to persist audit log:', error)
      return { success: false, error: error.message }
    }

    return { success: true, log_id: (data as { log_id: number }).log_id }
  } catch (err: unknown) {
    const e = err as { message?: string }
    console.error('[audit-service] Exception in recordAuditLog:', e)
    return { success: false, error: e.message ?? 'Audit log exception' }
  }
}

/**
 * Non-blocking fire-and-forget audit logger.
 * Never interrupts or fails parent business transactions.
 */
export function fireAuditLog(input: AuditLogInput): void {
  void recordAuditLog(input).catch((err) => {
    console.error('[audit-service] fireAuditLog unhandled rejection:', err)
  })
}

/**
 * Fetches audit logs for administration with pagination and filtering.
 */
export async function fetchAuditLogs(
  options?: {
    limit?: number
    offset?: number
    actor_user_id?: string
    action?: string
    resource_type?: string
  },
  clientOverride?: SupabaseClient,
): Promise<{ logs: AuditLogRow[]; total: number; error?: string }> {
  const supabase = clientOverride ?? createServiceClientRaw()
  const limit = Math.min(options?.limit ?? 50, 200)
  const offset = options?.offset ?? 0

  try {
    let query = supabase
      .from('audit_logs')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (options?.actor_user_id) {
      query = query.eq('actor_user_id', options.actor_user_id)
    }
    if (options?.action) {
      query = query.eq('action', options.action)
    }
    if (options?.resource_type) {
      query = query.eq('resource_type', options.resource_type)
    }

    const { data, count, error } = await query

    if (error) {
      return { logs: [], total: 0, error: error.message }
    }

    return {
      logs: (data ?? []) as AuditLogRow[],
      total: count ?? 0,
    }
  } catch (err: unknown) {
    const e = err as { message?: string }
    return { logs: [], total: 0, error: e.message ?? 'Failed to fetch audit logs' }
  }
}
