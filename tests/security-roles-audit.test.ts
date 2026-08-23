import { describe, expect, it } from 'vitest'
import {
  ALL_ROLES,
  STAFF_ROLES,
  getDefaultRouteForRole,
  hasPermission,
  isValidRole,
  type UserRole,
} from '../lib/security/roles'
import { assertOwnership } from '../lib/security/guards'
import type { AuditLogInput } from '../lib/services/audit-service'

describe('Security Roles, Capabilities & Isolation', () => {
  it('defines all canonical hospital roles', () => {
    expect(ALL_ROLES).toEqual([
      'Admin',
      'Doctor',
      'Nurse',
      'Pharmacist',
      'Patient',
    ])
    expect(STAFF_ROLES).toEqual(['Admin', 'Doctor', 'Nurse', 'Pharmacist'])
  })

  it('validates role strings with isValidRole', () => {
    expect(isValidRole('Admin')).toBe(true)
    expect(isValidRole('Doctor')).toBe(true)
    expect(isValidRole('Nurse')).toBe(true)
    expect(isValidRole('Pharmacist')).toBe(true)
    expect(isValidRole('Patient')).toBe(true)
    expect(isValidRole('Superuser')).toBe(false)
    expect(isValidRole('Hacker')).toBe(false)
    expect(isValidRole('')).toBe(false)
  })

  it('correctly maps roles to their home dashboard routes', () => {
    expect(getDefaultRouteForRole('Admin')).toBe('/admin')
    expect(getDefaultRouteForRole('Doctor')).toBe('/doctor')
    expect(getDefaultRouteForRole('Nurse')).toBe('/nurse')
    expect(getDefaultRouteForRole('Pharmacist')).toBe('/pharmacy')
    expect(getDefaultRouteForRole('Patient')).toBe('/patient')
    expect(getDefaultRouteForRole('Unknown')).toBe('/')
  })

  it('enforces strict role capability permissions', () => {
    // Admin has superuser access
    expect(hasPermission('Admin', 'view_audit_logs')).toBe(true)
    expect(hasPermission('Admin', 'manage_staff')).toBe(true)
    expect(hasPermission('Admin', 'manage_billing')).toBe(true)
    expect(hasPermission('Admin', 'dispense_medication')).toBe(true)

    // Doctor permissions
    expect(hasPermission('Doctor', 'create_patient_records')).toBe(true)
    expect(hasPermission('Doctor', 'manage_doctor_schedule')).toBe(true)
    expect(hasPermission('Doctor', 'manage_staff')).toBe(false)
    expect(hasPermission('Doctor', 'view_audit_logs')).toBe(false)

    // Nurse permissions
    expect(hasPermission('Nurse', 'view_patient_records')).toBe(true)
    expect(hasPermission('Nurse', 'create_patient_records')).toBe(false)
    expect(hasPermission('Nurse', 'manage_billing')).toBe(false)
    expect(hasPermission('Nurse', 'manage_staff')).toBe(false)

    // Pharmacist permissions
    expect(hasPermission('Pharmacist', 'dispense_medication')).toBe(true)
    expect(hasPermission('Pharmacist', 'manage_medication_stock')).toBe(true)
    expect(hasPermission('Pharmacist', 'create_patient_records')).toBe(false)
    expect(hasPermission('Pharmacist', 'manage_staff')).toBe(false)

    // Patient permissions
    expect(hasPermission('Patient', 'book_appointment')).toBe(true)
    expect(hasPermission('Patient', 'cancel_own_appointment')).toBe(true)
    expect(hasPermission('Patient', 'view_patient_records')).toBe(false)
    expect(hasPermission('Patient', 'dispense_medication')).toBe(false)
    expect(hasPermission('Patient', 'view_audit_logs')).toBe(false)
  })

  it('enforces ownership assertions with assertOwnership', () => {
    // Matching ownership succeeds without throwing
    expect(() => assertOwnership('user-123', 'user-123')).not.toThrow()
    expect(() => assertOwnership(42, 42)).not.toThrow()
    expect(() => assertOwnership('42', 42)).not.toThrow()

    // Mismatched ownership throws 403 error
    expect(() => assertOwnership('user-123', 'user-456')).toThrowError(
      /Access denied/i,
    )
    expect(() => assertOwnership(null, 'user-456')).toThrowError(
      /Access denied/i,
    )
    expect(() => assertOwnership(undefined, 10)).toThrowError(/Access denied/i)
  })

  it('validates audit log input structures', () => {
    const validEntry: AuditLogInput = {
      actor_user_id: '00000000-0000-0000-0000-000000000001',
      actor_role: 'Doctor',
      action: 'CREATE_MEDICAL_RECORD',
      resource_type: 'medical_records',
      resource_id: '1001',
      diff_payload: { diagnosis: 'Hypertension Stage 1' },
      ip_address: '127.0.0.1',
      user_agent: 'Vitest Test Agent',
    }

    expect(validEntry.action).toBe('CREATE_MEDICAL_RECORD')
    expect(validEntry.resource_type).toBe('medical_records')
    expect(validEntry.actor_role).toBe('Doctor')
  })
})
