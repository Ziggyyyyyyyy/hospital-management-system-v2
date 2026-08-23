# 🏥 Hospital Management System (HMS) — API Reference

Comprehensive REST API documentation for the Hospital Management System.

All API routes are served under `/api/*` and return standard JSON payloads.

---

## 📑 Table of Contents

1. [Architecture & Standard Conventions](#-standard-conventions)
2. [Authentication & Identity](#1-authentication--identity)
3. [Patients Domain](#2-patients-domain)
4. [Doctors & Specialties Domain](#3-doctors--specialties-domain)
5. [Appointments & Scheduling Domain](#4-appointments--scheduling-domain)
6. [Doctor Leave & Conflict Management](#5-doctor-leave--conflict-management)
7. [Consultation & Clinical Notes](#6-consultation--clinical-notes)
8. [Prescriptions Domain](#7-prescriptions-domain)
9. [AI Clinical Intelligence Domain](#8-ai-clinical-intelligence-domain)
10. [Notifications & Outbox Domain](#9-notifications--outbox-domain)
11. [Google Calendar Integration](#10-google-calendar-integration)
12. [Billing & Invoicing Domain](#11-billing--invoicing-domain)
13. [Pharmacy & Inventory Domain](#12-pharmacy--inventory-domain)
14. [Inpatient Admissions & Room Management](#13-inpatient-admissions--room-management)
15. [Admin Operations & Staff Management](#14-admin-operations--staff-management)
16. [Analytics & Metrics Domain](#15-analytics--metrics-domain)

---

## 🌐 Standard Conventions

### Authentication Header & Cookies
- User sessions are managed via Supabase Auth JWT cookies (parsed via `@supabase/ssr`).
- Sensitive operations resolve identity and enforce role permissions (`Admin`, `Doctor`, `Nurse`, `Patient`, `Pharmacist`).

### Standard Response Envelope

#### Success Response (`200 OK` / `201 Created`)
```json
{
  "status": "success",
  "data": { ... }
}
```
*(Or the direct object/array depending on the endpoint handler)*

#### Standard Error Response (`400`, `401`, `403`, `404`, `409`, `500`)
```json
{
  "code": "ERROR_CODE_STRING",
  "message": "Human-readable explanation of failure",
  "statusCode": 400,
  "details": {}
}
```

---

## 1. Authentication & Identity

### `GET /api/staff/me`
- **Purpose:** Retrieve the profile and role details of the currently authenticated staff member.
- **Auth Required:** Yes
- **Allowed Roles:** `Admin`, `Doctor`, `Nurse`, `Pharmacist`
- **Response:** `200 OK`
```json
{
  "staff_id": 6,
  "user_id": "00000000-0000-4000-a000-000000000002",
  "staff_type": "Doctor",
  "employment_status": "Active",
  "department_id": 1,
  "users": {
    "first_name": "Evelyn",
    "last_name": "Reed"
  }
}
```
- **Error Codes:** `401 Unauthorized`, `404 Not Found`

---

## 2. Patients Domain

### `GET /api/patients/me`
- **Purpose:** Retrieve the profile of the currently logged-in patient.
- **Auth Required:** Yes
- **Allowed Roles:** `Patient`
- **Response:** `200 OK`
```json
{
  "patient_id": 2,
  "user_id": "00000000-0000-4000-a000-000000000005",
  "blood_type": "O+",
  "users": {
    "first_name": "Sarah",
    "last_name": "Connor",
    "phone_number": "+1-555-0105",
    "gender": "Female",
    "date_of_birth": "1985-02-28"
  }
}
```

### `PATCH /api/patients/me`
- **Purpose:** Update the authenticated patient's personal profile.
- **Auth Required:** Yes
- **Allowed Roles:** `Patient`
- **Request Body:**
```json
{
  "first_name": "Sarah",
  "last_name": "Connor",
  "phone_number": "+1-555-9999",
  "blood_type": "O+"
}
```
- **Response:** `200 OK`

### `GET /api/patients/[id]`
- **Purpose:** Retrieve patient details by patient ID.
- **Auth Required:** Yes
- **Allowed Roles:** `Admin`, `Doctor`, `Nurse`
- **Response:** `200 OK`

---

## 3. Doctors & Specialties Domain

### `GET /api/specialties`
- **Purpose:** List all medical departments/specialties and the count of active doctors.
- **Auth Required:** No (Public / Authenticated)
- **Allowed Roles:** All
- **Response:** `200 OK`
```json
[
  {
    "department_id": 1,
    "name": "General Medicine",
    "doctor_count": 3
  },
  {
    "department_id": 2,
    "name": "Cardiology",
    "doctor_count": 2
  }
]
```

### `GET /api/doctors`
- **Purpose:** Retrieve active doctors, optionally filtered by `department_id`.
- **Query Params:** `?department_id=1` (optional)
- **Auth Required:** No (Public / Authenticated)
- **Response:** `200 OK`
```json
[
  {
    "staff_id": 6,
    "first_name": "Evelyn",
    "last_name": "Reed",
    "specialization": "Cardiology",
    "department_id": 2,
    "department_name": "Cardiology"
  }
]
```

### `GET /api/doctors/[id]`
- **Purpose:** Retrieve detailed doctor profile, department, and working hours.
- **Path Params:** `id` (Doctor Staff ID)
- **Response:** `200 OK`

### `GET /api/doctors/[id]/availability`
- **Purpose:** Retrieve the weekly recurring availability schedule for a doctor.
- **Path Params:** `id` (Doctor Staff ID)
- **Response:** `200 OK`
```json
[
  {
    "availability_id": 1,
    "doctor_id": 6,
    "day_of_week": 1,
    "start_time": "09:00:00",
    "end_time": "17:00:00",
    "break_start_time": "13:00:00",
    "break_end_time": "14:00:00",
    "slot_duration_minutes": 30,
    "is_available": true
  }
]
```

### `POST /api/doctors/[id]/availability`
- **Purpose:** Create or update a doctor's weekly availability schedule.
- **Auth Required:** Yes
- **Allowed Roles:** `Doctor` (own profile), `Admin`
- **Request Body:**
```json
{
  "day_of_week": 2,
  "start_time": "09:00",
  "end_time": "17:00",
  "break_start_time": "13:00",
  "break_end_time": "14:00",
  "slot_duration_minutes": 30,
  "is_available": true
}
```
- **Response:** `201 Created`

### `GET /api/doctors/[id]/slots`
- **Purpose:** Fetch generated bookable time slots for a doctor over a date window. Automatically cleans up expired holds before returning slots.
- **Query Params:** `?from=2026-08-25&to=2026-09-01`
- **Response:** `200 OK`
```json
[
  {
    "slot_id": 12,
    "doctor_id": 6,
    "start_time": "2026-08-25T09:00:00Z",
    "end_time": "2026-08-25T09:30:00Z",
    "duration_minutes": 30,
    "status": "AVAILABLE"
  }
]
```

---

## 4. Appointments & Scheduling Domain

### `GET /api/appointments`
- **Purpose:** List appointments filtered by caller's role (Patient sees own appointments; Doctor sees clinical schedule; Admin sees hospital appointments).
- **Auth Required:** Yes
- **Allowed Roles:** `Patient`, `Doctor`, `Admin`
- **Response:** `200 OK`

### `POST /api/appointments/hold`
- **Purpose:** Atomically acquire a 5-minute temporary hold on an `AVAILABLE` slot.
- **Auth Required:** Yes
- **Allowed Roles:** `Patient`, `Admin`
- **Request Body:**
```json
{
  "doctor_id": 6,
  "slot_id": 12,
  "patient_id": 2,
  "hold_duration_seconds": 300
}
```
- **Response:** `200 OK`
```json
{
  "hold_id": 101,
  "hold_token": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "expires_at": "2026-08-25T08:05:00Z",
  "slot_id": 12,
  "start_time": "2026-08-25T09:00:00Z",
  "end_time": "2026-08-25T09:30:00Z"
}
```
- **Error Codes:** `409 Conflict` (`SLOT_NOT_AVAILABLE`, `DOCTOR_ON_LEAVE`, `SLOT_IN_PAST`)

### `POST /api/appointments/confirm`
- **Purpose:** Confirm booking for an actively held slot and transition appointment to `CONFIRMED`.
- **Auth Required:** Yes
- **Allowed Roles:** `Patient`, `Admin`
- **Request Body:**
```json
{
  "hold_token": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "patient_id": 2,
  "reason_for_visit": "Cardiovascular consultation",
  "timezone": "UTC",
  "idempotency_key": "patient-book-12-1724456789"
}
```
- **Response:** `200 OK`
```json
{
  "appointment_id": 42,
  "status": "CONFIRMED",
  "slot_id": 12,
  "patient_id": 2,
  "doctor_id": 6,
  "booked_at": "2026-08-25T08:02:00Z"
}
```

### `POST /api/appointments/[id]/cancel`
- **Purpose:** Cancel a scheduled appointment, update appointment status to `CANCELLED`, free the bookable slot, and trigger outbox cancellation emails.
- **Auth Required:** Yes
- **Allowed Roles:** `Patient` (own appt), `Doctor` (own appt), `Admin`
- **Request Body:**
```json
{
  "reason": "PATIENT_REQUEST",
  "reason_text": "Schedule conflict - patient requested cancellation"
}
```
- **Response:** `200 OK`
```json
{
  "success": true,
  "appointment_id": 42,
  "old_status": "CONFIRMED",
  "new_status": "CANCELLED",
  "slot_freed": true
}
```

### `POST /api/appointments/[id]/reschedule`
- **Purpose:** Reschedule an existing appointment to a newly held slot.
- **Auth Required:** Yes
- **Allowed Roles:** `Patient`, `Admin`
- **Request Body:**
```json
{
  "new_hold_token": "7a93b4c1-8d23-41ee-9011-2c963f66bbb2",
  "new_slot_id": 18,
  "reason_for_visit": "Updated time consultation"
}
```
- **Response:** `200 OK`

---

## 5. Doctor Leave & Conflict Management

### `GET /api/doctor-leave`
- **Purpose:** List leave records for doctors.
- **Auth Required:** Yes
- **Allowed Roles:** `Doctor`, `Admin`
- **Response:** `200 OK`

### `POST /api/doctor-leave`
- **Purpose:** Submit a doctor leave request. Automatically triggers conflict detection and blocks overlapping bookable slots.
- **Auth Required:** Yes
- **Allowed Roles:** `Doctor`, `Admin`
- **Request Body:**
```json
{
  "doctor_id": 6,
  "start_date": "2026-09-01",
  "end_date": "2026-09-05",
  "leave_type": "ANNUAL",
  "reason": "Medical conference"
}
```
- **Response:** `201 Created`
```json
{
  "leave_id": 8,
  "doctor_id": 6,
  "status": "APPROVED",
  "conflicts_count": 2
}
```

### `PATCH /api/doctor-leave/[id]`
- **Purpose:** Update the approval status of a leave request (`APPROVED`, `REJECTED`, `CANCELLED`).
- **Auth Required:** Yes
- **Allowed Roles:** `Admin`
- **Response:** `200 OK`

---

## 6. Consultation & Clinical Notes

### `GET /api/post-visit-notes`
- **Purpose:** Retrieve clinical consultation notes.
- **Auth Required:** Yes
- **Allowed Roles:** `Doctor`, `Admin`
- **Response:** `200 OK`

### `POST /api/post-visit-notes`
- **Purpose:** Create post-visit clinical notes, diagnoses, and trigger post-visit AI summary generation.
- **Auth Required:** Yes
- **Allowed Roles:** `Doctor`
- **Request Body:**
```json
{
  "appointment_id": 42,
  "chief_complaint": "Persistent cough and mild chest pain",
  "diagnosis": "Acute Bronchitis",
  "clinical_notes": "Patient presented with 4-day history of dry cough. Vitals stable.",
  "treatment_plan": "Prescribed Azithromycin 500mg. Rest and hydration."
}
```
- **Response:** `201 Created`

### `GET /api/records` & `POST /api/records`
- **Purpose:** Comprehensive patient medical record CRUD operations.
- **Auth Required:** Yes
- **Allowed Roles:** `Doctor`, `Nurse`, `Admin`

---

## 7. Prescriptions Domain

### `GET /api/prescriptions`
- **Purpose:** Retrieve active prescriptions.
- **Auth Required:** Yes
- **Allowed Roles:** `Doctor`, `Pharmacist`, `Patient`, `Admin`
- **Response:** `200 OK`

### `POST /api/prescriptions`
- **Purpose:** Issue a new medication prescription for a patient.
- **Auth Required:** Yes
- **Allowed Roles:** `Doctor`
- **Request Body:**
```json
{
  "patient_id": 2,
  "doctor_id": 6,
  "appointment_id": 42,
  "medicine_id": 1,
  "dosage": "500mg",
  "frequency": "ONCE_DAILY",
  "duration_days": 7,
  "instructions": "Take after meals"
}
```
- **Response:** `201 Created`

---

## 8. AI Clinical Intelligence Domain

### `POST /api/symptoms`
- **Purpose:** Submit patient symptom questionnaire and trigger asynchronous Google Gemini AI pre-visit intake processing.
- **Auth Required:** Yes
- **Allowed Roles:** `Patient`
- **Request Body:**
```json
{
  "appointment_id": 42,
  "symptoms": "High fever for 3 days, dry cough, shortness of breath on exertion",
  "severity": "MODERATE",
  "duration_days": 3,
  "is_worsening": true,
  "additional_notes": "No previous history of asthma",
  "consent_given": true
}
```
- **Response:** `201 Created`

### `GET /api/ai/previsit/[appointment_id]`
- **Purpose:** Retrieve the structured AI pre-visit intelligence summary for a consultation.
- **Auth Required:** Yes
- **Allowed Roles:** `Patient` (own appt), `Doctor`, `Admin`
- **Response:** `200 OK`
```json
{
  "summary_id": 5,
  "appointment_id": 42,
  "status": "COMPLETED",
  "chief_complaint": "Acute Febrile Respiratory Symptoms",
  "urgency_rating": "URGENT",
  "clinical_summary": "Patient reports a 3-day history of high fever accompanied by worsening dry cough and dyspnea on exertion.",
  "suggested_questions": [
    "Could my fever and cough indicate a bacterial respiratory infection?",
    "Do I need a chest X-ray or blood tests today?",
    "What signs should prompt immediate emergency department evaluation?"
  ],
  "disclaimer": "AI-generated clinical decision-support. Not a medical diagnosis."
}
```

### `GET /api/ai/postvisit/[appointment_id]`
- **Purpose:** Retrieve the AI-generated patient post-visit summary and lifestyle guidance.
- **Auth Required:** Yes
- **Allowed Roles:** `Patient`, `Doctor`, `Admin`
- **Response:** `200 OK`

---

## 9. Notifications & Outbox Domain

### `GET /api/notifications`
- **Purpose:** Retrieve system notifications, delivery status, and timestamps.
- **Auth Required:** Yes
- **Allowed Roles:** `Admin`, `Patient`, `Doctor`
- **Response:** `200 OK`

### `POST /api/notifications/retry`
- **Purpose:** Background worker endpoint to retry failed notifications with exponential backoff.
- **Auth Required:** Yes
- **Allowed Roles:** `Admin` (or Internal Job Scheduler)
- **Response:** `200 OK`
```json
{
  "retried": 3,
  "succeeded": 3,
  "failed": 0
}
```

---

## 10. Google Calendar Integration

### `GET /api/calendar/authorize`
- **Purpose:** Generate the Google OAuth 2.0 authorization URL for doctors to connect their calendar.
- **Auth Required:** Yes
- **Allowed Roles:** `Doctor`, `Admin`
- **Response:** `200 OK`
```json
{
  "url": "https://accounts.google.com/o/oauth2/v2/auth?client_id=...&redirect_uri=..."
}
```

### `GET /api/calendar/callback`
- **Purpose:** Handles the OAuth redirect code from Google, exchanges it for access/refresh tokens, encrypts the tokens with AES-256-GCM, and persists them.
- **Auth Required:** Yes
- **Allowed Roles:** `Doctor`, `Admin`

### `POST /api/calendar/sync/[appointment_id]`
- **Purpose:** Synchronize a specific appointment to the doctor's connected Google Calendar.
- **Auth Required:** Yes
- **Allowed Roles:** `Doctor`, `Admin`
- **Response:** `200 OK`

---

## 11. Billing & Invoicing Domain

### `GET /api/billing`
- **Purpose:** List hospital invoices with status and totals.
- **Auth Required:** Yes
- **Allowed Roles:** `Admin`
- **Response:** `200 OK`

### `POST /api/billing`
- **Purpose:** Create an invoice for a patient.
- **Auth Required:** Yes
- **Allowed Roles:** `Admin`
- **Request Body:**
```json
{
  "patient_id": 2,
  "appointment_id": 42,
  "due_date": "2026-09-10"
}
```
- **Response:** `201 Created`

### `PATCH /api/billing/[id]`
- **Purpose:** Update invoice payment status (`PAID`, `PENDING`, `CANCELLED`).
- **Auth Required:** Yes
- **Allowed Roles:** `Admin`
- **Request Body:**
```json
{
  "status": "PAID",
  "paid_at": "2026-08-25T10:00:00Z"
}
```
- **Response:** `200 OK`

### `POST /api/billing/items`
- **Purpose:** Add a line-item to an existing invoice (`Medicine`, `Room`, `Consultation`, `Lab`).
- **Auth Required:** Yes
- **Allowed Roles:** `Admin`
- **Request Body:**
```json
{
  "invoice_id": 1,
  "item_type": "Medicine",
  "item_id": "1",
  "description": "Azithromycin 500mg (10 tabs)",
  "quantity": 2,
  "unit_price": 25.00
}
```
- **Response:** `201 Created`

### `GET /api/billing/patient/me`
- **Purpose:** Retrieve invoice history for the currently logged-in patient.
- **Auth Required:** Yes
- **Allowed Roles:** `Patient`
- **Response:** `200 OK`

---

## 12. Pharmacy & Inventory Domain

### `GET /api/medicine`
- **Purpose:** List medicine inventory with real-time stock levels and low-stock classification.
- **Auth Required:** Yes
- **Allowed Roles:** `Pharmacist`, `Doctor`, `Admin`
- **Response:** `200 OK`
```json
[
  {
    "medicine_id": 1,
    "name": "Azithromycin",
    "dosage": "500mg",
    "quantity_in_stock": 85,
    "unit_price": 25.00,
    "status": "In Stock"
  }
]
```

### `PATCH /api/medicine/[id]`
- **Purpose:** Restock or update unit pricing for a medicine in inventory.
- **Auth Required:** Yes
- **Allowed Roles:** `Pharmacist`, `Admin`
- **Request Body:**
```json
{
  "quantity_added": 50,
  "unit_price": 24.50
}
```
- **Response:** `200 OK`

### `POST /api/medicine/dispense`
- **Purpose:** Dispense medication against a prescription and deduct inventory quantity.
- **Auth Required:** Yes
- **Allowed Roles:** `Pharmacist`
- **Request Body:**
```json
{
  "prescription_id": 10,
  "quantity": 2,
  "notes": "Dispensed to patient"
}
```
- **Response:** `200 OK`

---

## 13. Inpatient Admissions & Room Management

### `GET /api/admission` & `POST /api/admission`
- **Purpose:** List inpatient admissions or admit a patient to an available hospital room.
- **Auth Required:** Yes
- **Allowed Roles:** `Admin`, `Doctor`, `Nurse`

### `PATCH /api/admission/[id]`
- **Purpose:** Update admission details or record patient discharge.
- **Auth Required:** Yes
- **Allowed Roles:** `Admin`, `Doctor`

### `GET /api/rooms`
- **Purpose:** List all hospital rooms, room types, and current occupancy status.
- **Auth Required:** Yes
- **Allowed Roles:** `Admin`, `Doctor`, `Nurse`
- **Response:** `200 OK`
```json
[
  {
    "room_id": 1,
    "room_number": "101",
    "room_type": "General",
    "daily_rate": 150.00,
    "status": "AVAILABLE"
  }
]
```

---

## 14. Admin Operations & Staff Management

### `GET /api/admin/staff` & `POST /api/admin/staff`
- **Purpose:** List all hospital staff or provision a new staff account (`Doctor`, `Nurse`, `Pharmacist`, `Admin`).
- **Auth Required:** Yes
- **Allowed Roles:** `Admin`
- **Request Body (POST):**
```json
{
  "email": "dr.smith@hms.local",
  "password": "SecurePassword123!",
  "first_name": "John",
  "last_name": "Smith",
  "staff_type": "Doctor",
  "department_id": 2,
  "license_number": "MED-99482"
}
```
- **Response:** `201 Created`

### `PATCH /api/admin/staff/[id]`
- **Purpose:** Update staff employment status (`Active`, `On Leave`, `Terminated`) or department.
- **Auth Required:** Yes
- **Allowed Roles:** `Admin`

### `PATCH /api/admin/assign-nurse`
- **Purpose:** Assign a duty nurse to an admitted inpatient.
- **Auth Required:** Yes
- **Allowed Roles:** `Admin`
- **Request Body:**
```json
{
  "admission_id": 3,
  "nurse_id": 4,
  "room_id": 1
}
```
- **Response:** `200 OK`

---

## 15. Analytics & Metrics Domain

All analytics endpoints require authentication and `Admin` role privileges.

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/dashboard/stats` | Hospital-wide KPI cards (active patients, doctors, admissions, revenue) |
| `GET` | `/api/dashboard/revenue-by-department` | Departmental revenue distribution |
| `GET` | `/api/dashboard/visits-by-department` | Patient visit volume by department |
| `GET` | `/api/dashboard/gender-distribution` | Demographics by gender |
| `GET` | `/api/dashboard/blood-type-distribution` | Demographics by blood group |
| `GET` | `/api/dashboard/item-type-count` | Billing item type distribution (`Medicine`, `Room`, `Consultation`, `Lab`) |
| `GET` | `/api/dashboard/medicine-quantity` | Medicine inventory volume and consumption metrics |

### Example Response (`GET /api/dashboard/revenue-by-department`)
```json
[
  { "department": "Cardiology", "revenue": 14500.00 },
  { "department": "General Medicine", "revenue": 9200.00 },
  { "department": "Pediatrics", "revenue": 5400.00 }
]
```

---

## 🔒 Security & Medical Disclaimer
All clinical information and endpoints are protected under application and database authorization boundaries. AI-generated responses are intended for clinical decision support and do not replace professional medical judgment.
