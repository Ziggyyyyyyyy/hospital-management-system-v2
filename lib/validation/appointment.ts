import { z } from 'zod'

// ============================================================
// Error codes (mirrors appointment/error-codes.ts — same shape)
// ============================================================
export type ApptErrorCode =
  | 'SLOT_NOT_AVAILABLE'
  | 'SLOT_ALREADY_HELD'
  | 'SLOT_HOLD_EXPIRED'
  | 'INVALID_HOLD'
  | 'HOLD_NOT_OWNED'
  | 'APPOINTMENT_ALREADY_CONFIRMED'
  | 'APPOINTMENT_NOT_FOUND'
  | 'INVALID_APPOINTMENT_STATE'
  | 'DOCTOR_ON_LEAVE'
  | 'BOOKING_CONFLICT'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'VALIDATION_ERROR'
  | 'INTERNAL_ERROR'
  | 'DOCTOR_NOT_FOUND'
  | 'SLOT_NOT_FOUND'
  | 'INVALID_DATE_RANGE'

export interface ApptErrorResult {
  code: ApptErrorCode
  message: string
  details?: Record<string, unknown>
  statusCode?: number
}

// ============================================================
// Domain enums (must mirror Postgres enums)
// ============================================================

export const SlotStatusSchema = z.enum([
  'AVAILABLE',
  'HELD',
  'BOOKED',
  'BLOCKED',
  'EXPIRED',
])
export type SlotStatus = z.infer<typeof SlotStatusSchema>

export const HoldStatusSchema = z.enum([
  'ACTIVE',
  'CONSUMED',
  'RELEASED',
  'EXPIRED',
])
export type HoldStatus = z.infer<typeof HoldStatusSchema>

export const AppointmentStatusSchema = z.enum([
  'HELD',
  'CONFIRMED',
  'COMPLETED',
  'CANCELLED',
  'RESCHEDULE_REQUIRED',
  'DOCTOR_LEAVE_CONFLICT',
])
export type AppointmentStatus = z.infer<typeof AppointmentStatusSchema>

export const LeaveTypeSchema = z.enum([
  'VACATION',
  'SICK',
  'PERSONAL',
  'EMERGENCY',
  'OTHER',
])
export type LeaveType = z.infer<typeof LeaveTypeSchema>

export const LeaveStatusSchema = z.enum([
  'PENDING',
  'APPROVED',
  'DENIED',
  'CANCELLED',
])
export type LeaveStatus = z.infer<typeof LeaveStatusSchema>

export const CancelReasonTypeSchema = z.enum([
  'PATIENT_REQUEST',
  'DOCTOR_UNAVAILABLE',
  'ADMIN_CANCELLED',
  'NO_SHOW',
  'OTHER',
])
export type CancelReasonType = z.infer<typeof CancelReasonTypeSchema>

// ============================================================
// Schemas
// ============================================================

// -------- Hold --------
export const HoldSlotInputSchema = z.object({
  slot_id: z.coerce.bigint().positive(),
  doctor_id: z.coerce.bigint().positive(),
})
export type HoldSlotInput = z.infer<typeof HoldSlotInputSchema>

// -------- Confirm booking --------
export const ConfirmBookingInputSchema = z.object({
  hold_token: z.string().uuid(),
  reason_for_visit: z.string().max(2000).optional(),
  timezone: z.string().default('UTC'),
  idempotency_key: z.string().min(1).max(128).optional(),
})
export type ConfirmBookingInput = z.infer<typeof ConfirmBookingInputSchema>

// -------- Cancel --------
export const CancelAppointmentInputSchema = z.object({
  reason: CancelReasonTypeSchema.default('OTHER'),
  reason_text: z.string().max(1000).optional(),
})
export type CancelAppointmentInput = z.infer<typeof CancelAppointmentInputSchema>

// -------- Reschedule --------
export const RescheduleAppointmentInputSchema = z.object({
  new_slot_id: z.coerce.bigint().positive(),
  new_hold_token: z.string().uuid(),
  reason_for_visit: z.string().max(2000).optional(),
})
export type RescheduleAppointmentInput = z.infer<
  typeof RescheduleAppointmentInputSchema
>

// -------- Doctor availability --------
export const CreateAvailabilitySchema = z.object({
  day_of_week: z.number().int().min(0).max(6),
  start_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
  end_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
  slot_duration_minutes: z.number().int().min(5).max(480).default(30),
  active: z.boolean().default(true),
  valid_from: z.string().date().optional(),
  valid_until: z.string().date().optional(),
})
export type CreateAvailabilityInput = z.infer<typeof CreateAvailabilitySchema>

export const UpdateAvailabilitySchema = CreateAvailabilitySchema.partial()
export type UpdateAvailabilityInput = z.infer<typeof UpdateAvailabilitySchema>

// -------- Doctor leave --------
// Base object schema kept separate so the partial update schema can be
// derived from it (.partial() only exists on ZodObject, not ZodEffects).
const LeaveBaseSchema = z.object({
  start_date: z.string().date(),
  end_date: z.string().date(),
  reason: z.string().max(1000).optional(),
  leave_type: LeaveTypeSchema.default('OTHER'),
  status: LeaveStatusSchema.default('PENDING'),
})

export const CreateLeaveSchema = LeaveBaseSchema.refine(
  (d) => new Date(d.start_date) <= new Date(d.end_date),
  {
    message: 'start_date must be <= end_date',
    path: ['end_date'],
  },
)
export type CreateLeaveInput = z.infer<typeof CreateLeaveSchema>

export const UpdateLeaveSchema = LeaveBaseSchema.partial()
export type UpdateLeaveInput = z.infer<typeof UpdateLeaveSchema>

// -------- Slots / availability query --------
export const SlotQuerySchema = z.object({
  date_from: z.string().date().optional(),
  date_to: z.string().date().optional(),
  status: SlotStatusSchema.optional(),
  specialty_id: z.coerce.bigint().positive().optional(),
})
export type SlotQuery = z.infer<typeof SlotQuerySchema>

// -------- Doctors query --------
export const DoctorQuerySchema = z.object({
  specialty_id: z.coerce.bigint().positive().optional(),
  department_id: z.coerce.bigint().positive().optional(),
})
export type DoctorQuery = z.infer<typeof DoctorQuerySchema>

// -------- Slot generation --------
export const GenerateSlotsSchema = z.object({
  from_date: z.string().date(),
  to_date: z.string().date(),
  force_rebuild: z.coerce.boolean().default(false),
})
.refine((d) => new Date(d.from_date) <= new Date(d.to_date), {
  message: 'from_date must be <= to_date',
  path: ['to_date'],
})
export type GenerateSlotsInput = z.infer<typeof GenerateSlotsSchema>

// ============================================================
// Additional domain enums
// ============================================================

export const SymptomSeveritySchema = z.enum([
  'MILD',
  'MODERATE',
  'SEVERE',
])
export type SymptomSeverity = z.infer<typeof SymptomSeveritySchema>

export const ProcessingStatusSchema = z.enum([
  'PENDING',
  'PROCESSING',
  'COMPLETED',
  'FAILED',
])
export type ProcessingStatus = z.infer<typeof ProcessingStatusSchema>

export const UrgencyLevelSchema = z.enum([
  'LOW',
  'MEDIUM',
  'HIGH',
])
export type UrgencyLevel = z.infer<typeof UrgencyLevelSchema>

export const MedicationFrequencySchema = z.enum([
  'ONCE_DAILY',
  'TWICE_DAILY',
  'THREE_TIMES_DAILY',
  'FOUR_TIMES_DAILY',
  'EVERY_4_HOURS',
  'EVERY_6_HOURS',
  'EVERY_8_HOURS',
  'EVERY_12_HOURS',
  'AS_NEEDED',
  'BEFORE_MEALS',
  'AFTER_MEALS',
  'AT_BEDTIME',
])
export type MedicationFrequency = z.infer<typeof MedicationFrequencySchema>

export const MedicationReminderStatusSchema = z.enum([
  'PENDING',
  'SENT',
  'DELIVERED',
  'FAILED',
  'MISSED',
  'DISMISSED',
])
export type MedicationReminderStatus = z.infer<typeof MedicationReminderStatusSchema>

export const NotificationTypeSchema = z.enum([
  'APPOINTMENT',
  'REMINDER',
  'PRESCRIPTION',
  'RESULT',
  'ALERT',
  'GENERAL',
])
export type NotificationType = z.infer<typeof NotificationTypeSchema>

export const NotificationChannelSchema = z.enum([
  'EMAIL',
  'SMS',
  'PUSH',
  'IN_APP',
])
export type NotificationChannel = z.infer<typeof NotificationChannelSchema>

// ============================================================
// Symptom Intake
// ============================================================

export const SymptomIntakeSchema = z.object({
  appointment_id: z.coerce.bigint().positive(),
  patient_id: z.coerce.bigint().positive(),
  symptoms: z.array(z.string().min(1)).min(1),
  severity: SymptomSeveritySchema,
  duration_text: z.string().min(1).max(500),
  worsening: z.boolean(),
  additional_context: z.string().max(2000).optional(),
  ai_processing_consent: z.boolean(),
})
// Note: one-per-appointment constraint must be enforced at the DB / service layer
// since Zod cannot perform lookups. Applications should check for an existing
// SymptomIntake row for the given appointment_id before insert.
export type SymptomIntake = z.infer<typeof SymptomIntakeSchema>

// ============================================================
// AI Previsit Summary
// ============================================================

export const AIPrevisitSummarySchema = z.object({
  id: z.coerce.bigint().positive().optional(),
  appointment_id: z.coerce.bigint().positive(),
  status: ProcessingStatusSchema.default('PENDING'),
  urgency: UrgencyLevelSchema.default('MEDIUM'),
  chief_complaint: z.string().min(1).max(2000),
  suggested_questions: z.array(z.string()).length(3),
  model: z.string().min(1).max(255).optional(),
  prompt_version: z.string().min(1).max(128).optional(),
  error_message: z.string().max(2000).optional(),
})
.refine((s) => s.status !== 'FAILED' || !!s.error_message, {
  message: 'error_message is required when status is FAILED',
  path: ['error_message'],
})
export type AIPrevisitSummary = z.infer<typeof AIPrevisitSummarySchema>

// ============================================================
// Post Visit Note
// ============================================================

export const PostVisitNoteSchema = z.object({
  appointment_id: z.coerce.bigint().positive(),
  patient_id: z.coerce.bigint().positive(),
  doctor_id: z.coerce.bigint().positive(),
  clinical_notes: z.string().min(1).max(10000),
  diagnosis: z.string().max(5000).optional(),
  follow_up_instr: z.string().max(5000).optional(),
})
export type PostVisitNote = z.infer<typeof PostVisitNoteSchema>

// ============================================================
// Post Visit Summary
// ============================================================

export const PostVisitSummarySchema = z.object({
  appointment_id: z.coerce.bigint().positive().optional(),
  visit_explanation: z.string().min(1).max(10000),
  medication_sched: z.string().min(1).max(10000),
  follow_up_steps: z.string().min(1).max(10000),
  instructions: z.string().min(1).max(10000),
  status: ProcessingStatusSchema.default('COMPLETED'),
})
export type PostVisitSummary = z.infer<typeof PostVisitSummarySchema>

// ============================================================
// Prescription
// ============================================================

export const PrescriptionItemSchema = z.object({
  medicine_name: z.string().min(1).max(255),
  dosage: z.string().min(1).max(255),
  frequency: MedicationFrequencySchema,
  duration_days: z.number().int().positive(),
  quantity: z.number().int().positive(),
  instructions: z.string().max(2000).optional(),
  medicine_id: z.coerce.bigint().positive().optional(),
})
export type PrescriptionItem = z.infer<typeof PrescriptionItemSchema>

export const PrescriptionSchema = z.object({
  patient_id: z.coerce.bigint().positive(),
  doctor_id: z.coerce.bigint().positive(),
  appointment_id: z.coerce.bigint().positive().optional(),
  items: z.array(PrescriptionItemSchema).min(1),
})
export type Prescription = z.infer<typeof PrescriptionSchema>

// ============================================================
// Medication Reminder
// ============================================================

export const MedicationReminderSchema = z.object({
  patient_id: z.coerce.bigint().positive(),
  prescription_item_id: z.coerce.bigint().positive(),
  medicine_name: z.string().min(1).max(255),
  dosage: z.string().min(1).max(255),
  scheduled_at: z.coerce.date(),
  status: MedicationReminderStatusSchema.default('PENDING'),
})
export type MedicationReminder = z.infer<typeof MedicationReminderSchema>

// ============================================================
// Notification
// ============================================================

export const NotificationSchema = z.object({
  type: NotificationTypeSchema,
  channel: NotificationChannelSchema,
  recipient: z.string().min(1).max(500),
  subject: z.string().max(500).optional(),
  body: z.string().min(1),
  template_name: z.string().min(1).max(255).optional(),
  template_vars: z.record(z.string(), z.unknown()).optional(),
})
.refine((n) => n.channel !== 'EMAIL' || !!n.subject, {
  message: 'subject is required when channel is EMAIL',
  path: ['subject'],
})
export type Notification = z.infer<typeof NotificationSchema>

// ============================================================
// Calendar Event
// ============================================================

export const CalendarEventSchema = z.object({
  appointment_id: z.coerce.bigint().positive(),
  summary: z.string().min(1).max(500),
  description: z.string().max(5000).optional(),
  start_time: z.coerce.date(),
  end_time: z.coerce.date(),
})
.refine((e) => new Date(e.start_time) <= new Date(e.end_time), {
  message: 'start_time must be <= end_time',
  path: ['end_time'],
})
export type CalendarEvent = z.infer<typeof CalendarEventSchema>
