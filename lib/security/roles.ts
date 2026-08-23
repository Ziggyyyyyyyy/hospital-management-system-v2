export type UserRole =
  | 'Admin'
  | 'Doctor'
  | 'Nurse'
  | 'Pharmacist'
  | 'Patient'

export const ALL_ROLES: readonly UserRole[] = [
  'Admin',
  'Doctor',
  'Nurse',
  'Pharmacist',
  'Patient',
]

export const STAFF_ROLES: readonly UserRole[] = [
  'Admin',
  'Doctor',
  'Nurse',
  'Pharmacist',
]

export type Permission =
  | 'view_patient_records'
  | 'create_patient_records'
  | 'edit_patient_records'
  | 'manage_staff'
  | 'manage_billing'
  | 'dispense_medication'
  | 'manage_medication_stock'
  | 'assign_nurse'
  | 'view_audit_logs'
  | 'book_appointment'
  | 'cancel_own_appointment'
  | 'cancel_any_appointment'
  | 'manage_doctor_schedule'
  | 'manage_doctor_leave'
  | 'use_ai_previsit'
  | 'use_ai_postvisit'

const ROLE_PERMISSIONS: Record<UserRole, readonly Permission[]> = {
  Admin: [
    'view_patient_records',
    'create_patient_records',
    'edit_patient_records',
    'manage_staff',
    'manage_billing',
    'dispense_medication',
    'manage_medication_stock',
    'assign_nurse',
    'view_audit_logs',
    'book_appointment',
    'cancel_own_appointment',
    'cancel_any_appointment',
    'manage_doctor_schedule',
    'manage_doctor_leave',
    'use_ai_previsit',
    'use_ai_postvisit',
  ],
  Doctor: [
    'view_patient_records',
    'create_patient_records',
    'edit_patient_records',
    'assign_nurse',
    'dispense_medication',
    'cancel_any_appointment',
    'manage_doctor_schedule',
    'manage_doctor_leave',
    'use_ai_previsit',
    'use_ai_postvisit',
  ],
  Nurse: [
    'view_patient_records',
    'edit_patient_records',
  ],
  Pharmacist: [
    'view_patient_records',
    'dispense_medication',
    'manage_medication_stock',
  ],
  Patient: [
    'book_appointment',
    'cancel_own_appointment',
    'use_ai_previsit',
    'use_ai_postvisit',
  ],
}

/**
 * Validates whether a given role holds a specific capability permission.
 */
export function hasPermission(role: string, permission: Permission): boolean {
  const typedRole = role as UserRole
  const permissions = ROLE_PERMISSIONS[typedRole]
  return Boolean(permissions && permissions.includes(permission))
}

/**
 * Maps a verified role to its canonical home dashboard URL.
 */
export function getDefaultRouteForRole(role: string): string {
  switch (role) {
    case 'Admin':
      return '/admin'
    case 'Doctor':
      return '/doctor'
    case 'Nurse':
      return '/nurse'
    case 'Pharmacist':
      return '/pharmacy'
    case 'Patient':
      return '/patient'
    default:
      return '/'
  }
}

/**
 * Validates whether a raw string is a recognized UserRole.
 */
export function isValidRole(role: string): role is UserRole {
  return ALL_ROLES.includes(role as UserRole)
}
