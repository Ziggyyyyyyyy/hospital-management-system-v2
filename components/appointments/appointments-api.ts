import type { ApiError, DoctorT, SpecialtyT, SlotT, AppointmentT } from './appointments-types'

type Any = Record<string, unknown>

async function apiFetch<T = unknown>(
  path: string,
  init?: RequestInit,
): Promise<{ success: true; data: T } | { success: false; error: ApiError }> {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
    cache: 'no-store',
  })
  const body = (await res.json().catch(() => ({
    success: false,
    error: { code: 'INTERNAL_ERROR', message: 'Invalid JSON response' },
  }))) as Any
  if (body.success) return { success: true, data: body.data as T }
  return { success: false, error: (body.error as ApiError) ?? { code: 'INTERNAL_ERROR', message: 'Unknown' } }
}

export async function fetchSpecialties(): Promise<SpecialtyT[]> {
  const res = await apiFetch<SpecialtyT[]>('/api/doctors')
  // Endpoint returns doctors; specialties are seeded via SQL. Fetch separately
  // using a direct fetch against slots endpoint? No. For now we fetch an
  // alternate path. To keep this functional in verification UI we expose a
  // tiny specialties API next to this file. Keep this method as a pass-through.
  const specRes = await fetch('/api/specialties', { cache: 'no-store' })
  const specJson = (await specRes.json()) as Any
  return ((specJson as any)?.data ?? []) as SpecialtyT[]
}

export async function fetchDoctors(params?: {
  specialty_id?: number
}): Promise<DoctorT[]> {
  const qs = params?.specialty_id
    ? `?specialty_id=${params.specialty_id}`
    : ''
  const res = await apiFetch<DoctorT[]>(`/api/doctors${qs}`)
  if (!res.success) throw new Error(res.error.message)
  return res.data
}

export async function fetchSlots(params: {
  doctor_id: number
  date_from?: string
  date_to?: string
  status?: string
}): Promise<{ doctor_id: number; range: Any; slots: SlotT[] }> {
  const parts: string[] = []
  if (params.date_from) parts.push(`date_from=${params.date_from}`)
  if (params.date_to) parts.push(`date_to=${params.date_to}`)
  if (params.status) parts.push(`status=${params.status}`)
  const qs = parts.length ? '?' + parts.join('&') : ''
  const res = await apiFetch<{ doctor_id: number; range: Any; slots: SlotT[] }>(
    `/api/doctors/${params.doctor_id}/slots${qs}`,
  )
  if (!res.success) throw new Error(res.error.message)
  return res.data
}

export async function holdSlot(params: {
  doctor_id: number
  slot_id: number
}): Promise<{
  hold_id: bigint
  hold_token: string
  expires_at: string
  slot_id: bigint
  start_time: string
  end_time: string
}> {
  const res = await apiFetch('/api/appointments/hold', {
    method: 'POST',
    body: JSON.stringify(params),
  })
  if (!res.success) throw new Error(res.error.message)
  return res.data as any
}

export async function confirmBooking(params: {
  hold_token: string
  reason_for_visit?: string
  timezone?: string
  idempotency_key?: string
}): Promise<{
  appointment_id: bigint
  slot_id: bigint
  doctor_id: bigint
  patient_id: bigint
  status: string
  is_idempotent: boolean
}> {
  const res = await apiFetch('/api/appointments/confirm', {
    method: 'POST',
    body: JSON.stringify(params),
  })
  if (!res.success) {
    const err: ApiError & { statusCode?: number } = res.error as any
    throw Object.assign(new Error(err.message), { code: err.code })
  }
  return res.data as any
}

export async function fetchMyAppointments(): Promise<AppointmentT[]> {
  const res = await apiFetch<{ appointments: AppointmentT[] }>('/api/appointments')
  if (!res.success) throw new Error(res.error.message)
  return res.data.appointments
}

export async function cancelAppointment(params: {
  id: number
  reason: 'PATIENT_REQUEST' | 'OTHER'
  reason_text?: string
}): Promise<any> {
  const res = await apiFetch(`/api/appointments/${params.id}/cancel`, {
    method: 'POST',
    body: JSON.stringify({
      reason: params.reason,
      reason_text: params.reason_text,
    }),
  })
  if (!res.success) throw new Error(res.error.message)
  return res.data
}

export async function rescheduleAppointment(params: {
  id: number
  new_slot_id: number
  new_hold_token: string
  reason_for_visit?: string
}): Promise<any> {
  const res = await apiFetch(`/api/appointments/${params.id}/reschedule`, {
    method: 'POST',
    body: JSON.stringify(params),
  })
  if (!res.success) throw new Error(res.error.message)
  return res.data
}
