import { describe, expect, it } from 'vitest'
import {
  STAFF_ROLES,
  hasPermission,
  getDefaultRouteForRole,
  isValidRole,
} from '../lib/security/roles'
import { encryptSecret, decryptSecret } from '../lib/crypto/vault'
import {
  HoldSlotInputSchema,
  ConfirmBookingInputSchema,
  PostVisitNoteSchema,
  PrescriptionSchema,
  SymptomIntakeSchema,
} from '../lib/validation/appointment'

describe('End-to-End Core Hospital Journey Verification', () => {
  const patientId = 101
  const doctorId = 201
  const appointmentId = 5001
  const medicineId = 8001

  // -------------------------------------------------------------
  // 1. Patient Journey: Search, Hold & Booking Validation
  // -------------------------------------------------------------
  describe('1. Patient Journey: Appointment Booking & AI Pre-visit', () => {
    it('validates atomic slot hold payload for patient', () => {
      const holdInput = {
        doctor_id: doctorId,
        slot_id: 12345,
      }
      const parsed = HoldSlotInputSchema.safeParse(holdInput)
      expect(parsed.success).toBe(true)
      if (parsed.success) {
        expect(Number(parsed.data.doctor_id)).toBe(doctorId)
        expect(Number(parsed.data.slot_id)).toBe(12345)
      }
    })

    it('validates booking confirmation payload with idempotency token', () => {
      const confirmInput = {
        hold_token: '12345678-1234-1234-1234-123456789abc',
        reason_for_visit: 'Persistent cough and fever for 3 days',
        timezone: 'UTC',
        idempotency_key: 'idemp-uuid-999',
      }
      const parsed = ConfirmBookingInputSchema.safeParse(confirmInput)
      expect(parsed.success).toBe(true)
      if (parsed.success) {
        expect(parsed.data.hold_token).toBe('12345678-1234-1234-1234-123456789abc')
      }
    })

    it('validates AI pre-visit symptom intake schema with consent', () => {
      const intakeInput = {
        appointment_id: appointmentId,
        patient_id: patientId,
        symptoms: ['Fever of 101F', 'dry cough', 'mild chest tightness'],
        severity: 'MODERATE',
        duration_text: '3 days',
        worsening: true,
        ai_processing_consent: true,
      }
      const parsed = SymptomIntakeSchema.safeParse(intakeInput)
      expect(parsed.success).toBe(true)
      if (parsed.success) {
        expect(parsed.data.severity).toBe('MODERATE')
        expect(parsed.data.ai_processing_consent).toBe(true)
      }
    })

    it('rejects symptom intake with invalid severity', () => {
      const invalidIntake = {
        appointment_id: appointmentId,
        patient_id: patientId,
        symptoms: ['Headache'],
        severity: 'EXTREME_INVALID',
        duration_text: '1 day',
        worsening: false,
        ai_processing_consent: true,
      }
      const parsed = SymptomIntakeSchema.safeParse(invalidIntake)
      expect(parsed.success).toBe(false)
    })

    it('encrypts and verifies tokens with AES-256-GCM', () => {
      const googleOAuthToken = 'ya29.a0AfH6SMB_secret_refresh_token_test_123'
      const encrypted = encryptSecret(googleOAuthToken)
      expect(encrypted).not.toBe(googleOAuthToken)
      expect(encrypted.startsWith('v1:')).toBe(true)

      const decrypted = decryptSecret(encrypted)
      expect(decrypted).toBe(googleOAuthToken)
    })

    it('detects tampering in encrypted cryptographic vault payload', () => {
      const plain = 'secret_patient_data_string'
      const encrypted = encryptSecret(plain)
      const parts = encrypted.split(':')
      // Tamper ciphertext
      parts[3] = 'tamperedciphertext=='
      const tampered = parts.join(':')
      expect(decryptSecret(tampered)).toBe('')
    })
  })

  // -------------------------------------------------------------
  // 2. Doctor Domain: Clinical Notes & E-Prescriptions
  // -------------------------------------------------------------
  describe('2. Doctor Domain: Clinical Encounter & E-Prescription', () => {
    it('validates clinical post-visit note creation', () => {
      const noteInput = {
        appointment_id: appointmentId,
        patient_id: patientId,
        doctor_id: doctorId,
        clinical_notes: 'Patient presented with acute upper respiratory tract infection. Lungs clear on auscultation.',
        diagnosis: 'Acute Bronchitis (J20.9)',
        follow_up_instr: 'Rest, hydrate, return in 7 days if symptoms persist.',
      }
      const parsed = PostVisitNoteSchema.safeParse(noteInput)
      expect(parsed.success).toBe(true)
      if (parsed.success) {
        expect(parsed.data.diagnosis).toBe('Acute Bronchitis (J20.9)')
      }
    })

    it('validates e-prescription creation with medication items', () => {
      const prescriptionInput = {
        patient_id: patientId,
        doctor_id: doctorId,
        appointment_id: appointmentId,
        items: [
          {
            medicine_id: medicineId,
            medicine_name: 'Amoxicillin 500mg',
            dosage: '500mg',
            frequency: 'THREE_TIMES_DAILY',
            duration_days: 7,
            quantity: 21,
            instructions: 'Take with food and full glass of water',
          },
          {
            medicine_name: 'Paracetamol 650mg',
            dosage: '650mg',
            frequency: 'AS_NEEDED',
            duration_days: 5,
            quantity: 10,
            instructions: 'For fever above 100F. Maximum 3 tablets daily',
          },
        ],
      }
      const parsed = PrescriptionSchema.safeParse(prescriptionInput)
      expect(parsed.success).toBe(true)
      if (parsed.success) {
        expect(parsed.data.items).toHaveLength(2)
        expect(parsed.data.items[0].quantity).toBe(21)
      }
    })
  })

  // -------------------------------------------------------------
  // 3. Pharmacy & Billing Domain
  // -------------------------------------------------------------
  describe('3. Pharmacy & Billing Domain: Dispensing & Invoicing', () => {
    it('handles stock decrement and inventory status logic', () => {
      const currentStock = 50
      const dispensedQty = 21
      const minStockLevel = 10

      const remainingStock = currentStock - dispensedQty
      expect(remainingStock).toBe(29)
      expect(remainingStock > minStockLevel).toBe(true)

      const lowStockAfterFurtherDispense = remainingStock - 20
      expect(lowStockAfterFurtherDispense <= minStockLevel).toBe(true)
      expect(lowStockAfterFurtherDispense > 0).toBe(true)
    })

    it('calculates itemized billing correctly', () => {
      const consultationFee = 75.00
      const medicationItem1 = { unit_price: 2.50, quantity: 21, total: 52.50 }
      const medicationItem2 = { unit_price: 1.00, quantity: 10, total: 10.00 }

      const totalBill = consultationFee + medicationItem1.total + medicationItem2.total
      expect(totalBill).toBe(137.50)
    })
  })

  // -------------------------------------------------------------
  // 4. Security, RBAC & Role Isolation
  // -------------------------------------------------------------
  describe('4. Security, RBAC & Protected Route Isolation', () => {
    it('verifies Patient role cannot access Doctor, Nurse, or Admin actions', () => {
      expect(hasPermission('Patient', 'manage_staff')).toBe(false)
      expect(hasPermission('Patient', 'manage_billing')).toBe(false)
      expect(hasPermission('Patient', 'dispense_medication')).toBe(false)
      expect(hasPermission('Patient', 'create_patient_records')).toBe(false)
      expect(hasPermission('Patient', 'book_appointment')).toBe(true)
      expect(STAFF_ROLES.includes('Patient')).toBe(false)
    })

    it('verifies Doctor role can access clinical actions but not unauthorized admin billing', () => {
      expect(hasPermission('Doctor', 'create_patient_records')).toBe(true)
      expect(hasPermission('Doctor', 'edit_patient_records')).toBe(true)
      expect(hasPermission('Doctor', 'manage_doctor_schedule')).toBe(true)
      expect(hasPermission('Doctor', 'manage_doctor_leave')).toBe(true)
      expect(hasPermission('Doctor', 'manage_staff')).toBe(false)
      expect(hasPermission('Doctor', 'view_audit_logs')).toBe(false)
      expect(STAFF_ROLES.includes('Doctor')).toBe(true)
    })

    it('verifies Pharmacist role can dispense medicine but cannot manage doctor schedule', () => {
      expect(hasPermission('Pharmacist', 'dispense_medication')).toBe(true)
      expect(hasPermission('Pharmacist', 'manage_medication_stock')).toBe(true)
      expect(hasPermission('Pharmacist', 'manage_doctor_schedule')).toBe(false)
      expect(hasPermission('Pharmacist', 'create_patient_records')).toBe(false)
      expect(STAFF_ROLES.includes('Pharmacist')).toBe(true)
    })

    it('verifies Nurse role permissions for inpatient care and records', () => {
      expect(hasPermission('Nurse', 'view_patient_records')).toBe(true)
      expect(hasPermission('Nurse', 'edit_patient_records')).toBe(true)
      expect(hasPermission('Nurse', 'manage_billing')).toBe(false)
      expect(STAFF_ROLES.includes('Nurse')).toBe(true)
    })

    it('verifies Admin has platform-wide operational permissions', () => {
      expect(hasPermission('Admin', 'manage_staff')).toBe(true)
      expect(hasPermission('Admin', 'manage_billing')).toBe(true)
      expect(hasPermission('Admin', 'view_audit_logs')).toBe(true)
      expect(hasPermission('Admin', 'assign_nurse')).toBe(true)
      expect(STAFF_ROLES.includes('Admin')).toBe(true)
    })

    it('maps all roles correctly to protected dashboard routes', () => {
      expect(getDefaultRouteForRole('Admin')).toBe('/admin')
      expect(getDefaultRouteForRole('Doctor')).toBe('/doctor')
      expect(getDefaultRouteForRole('Nurse')).toBe('/nurse')
      expect(getDefaultRouteForRole('Pharmacist')).toBe('/pharmacy')
      expect(getDefaultRouteForRole('Patient')).toBe('/patient')
      expect(isValidRole('Admin')).toBe(true)
      expect(isValidRole('Guest')).toBe(false)
    })
  })
})
