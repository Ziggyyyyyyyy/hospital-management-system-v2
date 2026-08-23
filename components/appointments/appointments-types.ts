export interface SpecialtyT {
  specialty_id: number
  name: string
  description: string | null
  active: boolean
  created_at: string
  updated_at: string
}

export interface DoctorT {
  staff_id: number
  user_id: string
  department_id: number | null
  staff_type: string
  license_number: string | null
  employment_status: string | null
  full_name: string
  users?: { first_name?: string; last_name?: string }
  doctor_specialties: Array<{
    specialty_id: number
    is_primary: boolean
    specialty?: SpecialtyT
  }>
}

export interface SlotT {
  slot_id: number
  doctor_id: number
  start_time: string
  end_time: string
  duration_minutes: number
  status: 'AVAILABLE' | 'HELD' | 'BOOKED' | 'BLOCKED' | 'EXPIRED'
}

export interface AppointmentT {
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
  confirmed_at: string | null
  completed_at: string | null
  cancelled_at: string | null
  cancel_reason: string | null
  cancel_reason_text: string | null
  reschedule_count: number
  timezone: string
  created_at: string
  updated_at: string
  slot?: SlotT
}

export interface ApiError {
  code: string
  message: string
  details?: Record<string, unknown>
}
