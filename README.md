# 🏥 Hospital Management System (HMS)

<p align="center">
  <strong>A Full-Stack, Role-Based Healthcare Operations & Clinical Scheduling Platform</strong>
</p>

<p align="center">
  Streamlining clinical consultations, concurrent slot booking, doctor availability, AI-assisted pre/post-visit documentation, pharmacy dispensing, hospital billing, and asynchronous notifications within a single secure, role-aware system.
</p>

<p align="center">

![Next.js](https://img.shields.io/badge/Next.js-15.3.2-black?logo=next.js)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0-3178C6?logo=typescript)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-v4-06B6D4?logo=tailwindcss)
![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-3ECF8E?logo=supabase)
![Google Gemini](https://img.shields.io/badge/AI-Google_Gemini-4285F4?logo=google)
![Resend](https://img.shields.io/badge/Email-Resend_API-black)
![Vitest](https://img.shields.io/badge/Testing-Vitest-6E9F18?logo=vitest)

</p>

---

## 📌 1. Project Overview & Problem Solved

Traditional healthcare facilities often operate across fragmented, siloed software: appointment scheduling is decoupled from doctor leave schedules, clinical documentation lacks structured intake, patient reminders require manual follow-up, and billing/pharmacy records are maintained independently. This leads to double-booking conflicts, high patient no-show rates, administrative overhead, and fragmented patient medical histories.

The **Hospital Management System (HMS)** solves these challenges by providing a unified, real-time, role-aware platform that connects:
- **Patients** to verified specialists with real-time atomic slot reservation.
- **Doctors** with automated schedule conflict detection, structured consultation tools, and AI-assisted documentation.
- **Nurses** with inpatient room assignments and patient care monitoring.
- **Pharmacists** with real-time inventory tracking, low-stock alerts, and prescription dispensing.
- **Administrators** with hospital-wide operational analytics, staff provisioning, room allocation, and unified billing.

---

## ✨ 2. Key Features

- **🛡️ Multi-Tenant Role-Based Access Control (RBAC):** Distinct dashboards, route guards, and permission scopes for `Admin`, `Doctor`, `Nurse`, `Patient`, and `Pharmacist`.
- **⏱️ Concurrency-Safe Slot Reservation:** Atomic 5-minute temporary slot holding powered by PostgreSQL advisory locks and transaction-level row locks (`FOR UPDATE`) to prevent race conditions and double-booking.
- **📅 Dynamic Availability & Doctor Leave Management:** Automated doctor slot generation based on shift windows, break times, and slot duration, coupled with automated conflict detection and rescheduling triggers when leave is approved.
- **🤖 Dual-Stage AI Clinical Intelligence:** Pre-visit symptom intake analysis (chief complaint, urgency rating, clinical summary, and suggested patient questions) and post-visit clinical summary generation powered by Google Gemini with graceful fallback handling.
- **📬 Multi-Channel Notification Engine:** Asynchronous outbox pattern delivering booking confirmations, cancellations, reschedules, and doctor leave alerts via Resend API / SMTP with automated exponential-backoff retries.
- **📆 Google Calendar Bi-Directional Synchronization:** OAuth 2.0 calendar integration featuring client-side AES-256-GCM token encryption (`crypto/vault`) and automated event creation, updating, and cancellation.
- **💊 Pharmacy & Real-Time Stock Management:** Categorized inventory management (`In Stock`, `Low Stock`, `Out of Stock`) with automated transaction logging upon dispensing or restocking.
- **💳 Unified Billing & Invoicing:** Dynamic invoice generation with multi-item categorization (`Medicine`, `Room`, `Consultation`, `Lab`), payment status tracking, and automated calculation.
- **📊 Real-Time Hospital Analytics:** Departmental revenue distribution, patient demographics (gender, blood type), visit frequency trends, and pharmaceutical consumption analytics rendered via Recharts.

---

## 🏗️ 3. Architecture & High-Level Workflow

The application is structured as a modern full-stack App Router application with strict separation between presentation, API boundary, domain services, and database persistence.

```text
┌───────────────────────────────────────────────────────────────────────────┐
│                           Client Presentation Layer                       │
│     (Next.js 15 App Router · React 19 · Tailwind CSS v4 · Radix UI)       │
├─────────────┬─────────────┬──────────────┬─────────────┬──────────────────┤
│    Admin    │   Doctor    │    Nurse     │   Patient   │    Pharmacist    │
│  Workspace  │  Workspace  │  Workspace   │  Workspace  │    Workspace     │
└──────┬──────┴──────┬──────┴──────┬───────┴──────┬──────┴────────┬─────────┘
       │             │             │              │               │
       └─────────────┴─────────────┼──────────────┴───────────────┘
                                   ▼
┌───────────────────────────────────────────────────────────────────────────┐
│                     Next.js Route Handlers / API Layer                    │
│      (Identity Resolution · Role Enforcement · Zod Payload Validation)    │
└──────────────────────────────────┬────────────────────────────────────────┘
                                   ▼
┌───────────────────────────────────────────────────────────────────────────┐
│                          Core Domain Services                             │
│  ┌───────────────────────┬────────────────────────┬────────────────────┐  │
│  │ Booking & Hold Engine │ Leave & Availability   │ AI Intake Service  │  │
│  ├───────────────────────┼────────────────────────┼────────────────────┤  │
│  │ Outbox Event Engine   │ Notification Service   │ Calendar Service   │  │
│  ├───────────────────────┼────────────────────────┼────────────────────┤  │
│  │ Billing & Pharmacy    │ AES-256 Crypto Vault   │ Reminder Service   │  │
│  └───────────────────────┴────────────────────────┴────────────────────┘  │
└──────────────────────────────────┬────────────────────────────────────────┘
                                   ▼
┌───────────────────────────────────────────────────────────────────────────┐
│                   Supabase Managed PostgreSQL Database                    │
│   (Row Level Security · Advisory Locks · Atomic RPC Functions · Triggers) │
└───────────────────────────────────────────────────────────────────────────┘
```

### High-Level End-to-End Patient Workflow
```text
Select Department / Specialty
       │
       ▼
Select Doctor & Inspect Profile
       │
       ▼
Choose Date & Time Slot
       │
       ▼
Acquire 5-Minute Atomic Slot Hold (Advisory Lock)
       │
       ▼
Confirm Appointment Booking (Idempotency Key)
       │
       ├──────────────────────────────────────────┐
       ▼                                          ▼
Trigger Email Outbox (Resend API)       Trigger Google Calendar Sync
       │
       ▼
Submit Pre-Visit AI Symptom Intake
       │
       ▼
AI Processes Urgency, Summary & Suggested Questions
       │
       ▼
Doctor Conducts Consultation & Records Notes / Prescriptions
       │
       ▼
Pharmacist Dispenses Prescribed Medicines & Admin Finalizes Invoice
```

---

## 🛠️ 4. Technology Stack

### Frontend & UI
- **Framework:** Next.js 15.3.2 (React 19, App Router)
- **Styling:** Tailwind CSS v4 with semantic CSS variables
- **Component Primitives:** Radix UI (Dialog, Select, Tabs, Dropdown, Accordion, Tooltip)
- **Icons:** Lucide React
- **Data Visualization:** Recharts
- **Toast Notifications:** Sonner
- **Theming:** `next-themes` (Full Light/Dark mode support)

### Backend & API
- **Runtime:** Node.js 18+ (Next.js Server Runtime & Server Actions)
- **Validation:** Zod v3 schemas for strict request payload validation
- **Security & Crypto:** Web Crypto API / Node `crypto` for AES-256-GCM token encryption

### Database & Auth
- **Platform:** Supabase (PostgreSQL 15+)
- **Authentication:** Supabase Auth (JWT session handling and cookie management via `@supabase/ssr`)
- **Authorization:** PostgreSQL Row Level Security (RLS) policies and stored PL/pgSQL procedures

### External Integrations
- **AI / LLM:** Google Gemini API (`@google/genai` model `gemini-3.6-flash`)
- **Email Delivery:** Resend API / SMTP provider fallback
- **Calendar Integration:** Google Calendar REST API (OAuth 2.0)

### Testing & Quality
- **Test Framework:** Vitest v4 with isolated test harnesses
- **Type Checking:** TypeScript 5.0 (Strict mode enabled)
- **Linting:** ESLint 9

---

## 👥 5. Main Modules & Role-Based Workspaces

### 🧑‍🤝‍🧑 Patient Workspace (`/patient`)
- **Specialty & Doctor Discovery:** Search and filter active doctors by department and specialization.
- **Interactive Booking:** Live calendar slot picker with real-time 5-minute countdown timers for held slots.
- **AI Pre-Visit Intake:** Guided symptom questionnaire recording severity, duration, worsening factors, and consent.
- **Personal Records & Invoices:** Real-time visibility into past and upcoming appointments, prescriptions, and billing statements.

### 👨‍⚕️ Doctor Workspace (`/doctor`)
- **Clinical Schedule:** Daily and weekly view of confirmed and completed appointments.
- **Consultation & Notes:** Creation of structured post-visit clinical notes, diagnoses, and medication prescriptions.
- **Availability Management:** Configuration of recurring weekly schedules (working days, start/end hours, break times, and slot duration).
- **Leave Application:** Requesting leave with automatic conflict inspection for existing patient bookings.

### 👩‍⚕️ Nurse Workspace (`/nurse`)
- **Inpatient Care Management:** Overview of active admissions, assigned rooms, and patient vitals.
- **Patient Monitoring:** Rapid lookup of patient emergency contacts and blood groups.

### 💊 Pharmacy Workspace (`/pharmacy`)
- **Inventory Control:** Live stock monitoring with visual classification (`In Stock`, `Low Stock < 20`, `Out of Stock = 0`).
- **Dispensing Workflows:** One-click medicine dispensing linked directly to inventory deductions.
- **Stock Replenishment:** Restocking medicines with automated unit cost and stock level updates.

### 🛡️ Administrator Workspace (`/admin`)
- **Staff Provisioning:** Creation, editing, and activation of Doctor, Nurse, Pharmacist, and Admin staff accounts.
- **Room & Nurse Allocation:** Managing hospital rooms and assigning duty nurses to admitted patients.
- **Billing Management:** Invoice generation, line-item pricing (`Medicine`, `Room`, `Consultation`), and payment tracking.
- **Executive Analytics:** Departmental breakdown of revenue, visits, patient demographics, and medicine utilization.

---

## 🔒 6. Authentication and Role-Based Access Control (RBAC)

The system implements multi-layered authentication and authorization:

```text
Incoming Request
       │
       ▼
1. Supabase Session Validation (JWT verification via cookies)
       │
       ▼
2. Identity Resolution (`resolveIdentity` fetches User ID, Email, Staff ID, Patient ID)
       │
       ▼
3. Role Verification (`requireRoles` restricts route to permitted roles: Admin, Doctor, etc.)
       │
       ▼
4. Resource Ownership Verification (e.g., verifying `appointment.patient_id === caller.patientId`)
       │
       ▼
5. Service Execution (PostgreSQL transaction / RLS query)
```

- **Role Resolution:** Handled centrally in [`utils/get-role.ts`](file:///c:/Users/hp/hospital-management-system/utils/get-role.ts) and [`lib/appointments/api-helpers.ts`](file:///c:/Users/hp/hospital-management-system/lib/appointments/api-helpers.ts).
- **Service Client Isolation:** To prevent recursive RLS evaluation issues while preserving security, administrative and cross-table operations use `createServiceClient()` **strictly after** identity and role requirements have passed at the API boundary.

---

## ⏱️ 7. Appointment Slot Hold + Double-Booking Protection

To prevent concurrent users from booking the same doctor slot simultaneously, HMS employs a robust two-phase commit reservation strategy:

```text
Phase 1: Temporary Hold
-----------------------
Patient selects Slot
       │
       ▼
Call `atomic_hold_slot()` RPC
       │
       ├─ Acquire 64-bit PostgreSQL advisory transaction lock on Slot ID
       ├─ Expire any stale holds on the slot (`expires_at < NOW()`)
       ├─ Lock slot row (`FOR UPDATE`) and verify status is 'AVAILABLE'
       ├─ Verify doctor is not on approved/pending leave
       ├─ Mark slot status as 'HELD'
       └─ Insert record into `slot_holds` with a 5-minute UUID `hold_token`

Phase 2: Booking Confirmation
-----------------------------
Patient clicks Confirm Booking
       │
       ▼
Call `atomic_confirm_booking()` RPC
       │
       ├─ Verify `hold_token` exists, is 'ACTIVE', and `expires_at > NOW()`
       ├─ Check idempotency key to prevent duplicate booking on double-click
       ├─ Transition slot status: 'HELD' → 'BOOKED'
       ├─ Transition hold status: 'ACTIVE' → 'CONSUMED'
       ├─ Insert appointment row with status 'CONFIRMED'
       └─ Enqueue asynchronous outbox notifications
```

---

## 📅 8. Doctor Leave & Conflict Handling

When a doctor applies for leave:
1. **Overlap Detection:** The system evaluates all future slots between `start_date` and `end_date`.
2. **Conflict Resolution (`process_doctor_leave_conflicts`):**
   - All `AVAILABLE` slots within the leave window are transitioned to `BLOCKED`.
   - All active holds are released.
   - Any already `CONFIRMED` appointments are updated to `DOCTOR_LEAVE_CONFLICT` or `RESCHEDULE_REQUIRED`.
3. **Automated Patient Alerts:** Outbox events are dispatched to notify affected patients with a link to reschedule.

---

## 🤖 9. AI/LLM Features & Fallback Resilience

The AI module uses Google Gemini (`gemini-3.6-flash`) via [`lib/ai/gemini.ts`](file:///c:/Users/hp/hospital-management-system/lib/ai/gemini.ts) with strict structured JSON output parsing and validation via Zod schemas.

### Pre-Visit Symptom Intelligence
- Analyzes patient symptoms, duration, and severity.
- Produces:
  - **Chief Complaint** (clinical summary)
  - **Urgency Rating** (`EMERGENT` | `URGENT` | `ROUTINE` | `SELF_CARE`)
  - **Suggested Questions** (3 personalized questions for the patient to ask their doctor)
- **Medical Disclaimer:** Explicitly attached to all AI-generated outputs.

### Fallback & Error Handling
- If the Gemini API key is missing, network requests timeout, or the model produces malformed JSON:
  - The status is recorded as `FAILED` in `ai_previsit_summaries`.
  - The patient dashboard displays a non-blocking error notice with a **Retry** button.
  - Core appointment booking and clinical consultation workflows continue without interruption.

---

## 📬 10. Email & Notification System

HMS features an extensible notification system supporting multiple providers:
- **Resend API Provider:** Production HTTP delivery using official Resend SDK.
- **Stub Provider:** In-memory / database-only logger for isolated local development and automated testing.

### Supported Notification Triggers
1. **Booking Confirmation:** Sent to both patient and doctor with appointment details.
2. **Appointment Cancellation:** Sent when an appointment is cancelled by patient, doctor, or admin.
3. **Appointment Reschedule:** Sent when an appointment time is updated.
4. **Doctor Leave Conflict:** Sent to patients whose appointments coincide with approved leave.
5. **AI Summary Ready:** Sent when pre-visit or post-visit AI notes are generated.

---

## 📆 11. Google Calendar Integration & OAuth Vault

- **OAuth 2.0 Flow:** Doctors can connect their Google Calendar via `/api/calendar/authorize` and `/api/calendar/callback`.
- **AES-256-GCM Vault:** OAuth refresh and access tokens are encrypted at rest using AES-256-GCM (`lib/crypto/vault.ts`) before being stored in `google_calendar_tokens`.
- **Event Lifecycle:**
  - `fireCalendarCreate`: Generates calendar event with patient details upon booking confirmation.
  - `fireCalendarUpdate`: Updates start/end times upon rescheduling.
  - `fireCalendarDelete`: Deletes the calendar event upon cancellation.

---

## ⚙️ 12. Background Jobs & Retries

- **Notification Retry Worker (`POST /api/notifications/retry`):** Queries failed notification records and re-attempts delivery with exponential backoff up to `max_retries` (default: 3).
- **Hold Expiry Engine (`expireStaleHolds`):** Periodically cleans expired temporary slot holds and restores abandoned slots to `AVAILABLE`.
- **Medication Reminders (`POST /api/medications/process-reminders`):** Checks prescription frequencies and schedules automated patient reminders.

---

## 🗄️ 13. Database Overview & Schema Migrations

All database schemas and procedures are versioned under `supabase/migrations/`:

| Migration File | Description |
| :--- | :--- |
| `20260820170000_base_schema.sql` | Users, Patients, Staff, Departments, Rooms, Admissions, Medicines, Billing |
| `20260820180000_appointment_domain.sql` | Slots, Appointments, Slot Holds, Doctor Availability, Doctor Leave |
| `20260820181000_appointment_rpc.sql` | Atomic PL/pgSQL procedures (`atomic_hold_slot`, `atomic_confirm_booking`, etc.) |
| `20260821060400_ai_visit_intelligence.sql` | Pre-visit and post-visit AI intake schemas |
| `20260821070000_post_visit_reminders.sql` | Medication schedules and reminder tracking |
| `20260821080000_notifications_calendar.sql` | Notification records, OAuth tokens, Google Calendar mappings |
| `20260821090000_notifications_dedupe_meds.sql` | Notification deduplication indices and medication lookahead |
| `20260824000000_security_foundation.sql` | Row Level Security (RLS) policies and security triggers |

---

## 🚀 14. Local Setup & Development Instructions

### Prerequisites
- Node.js 18.x or 20.x
- npm or pnpm
- A Supabase project (Free tier or local Docker instance)
- Google Gemini API Key (optional, for AI features)
- Resend API Key (optional, for live email delivery)

### 1. Clone the Repository
```bash
git clone https://github.com/Ziggyyyyyyyy/hospital-management-system.git
cd hospital-management-system
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Configure Environment Variables
Copy `.env.example` to `.env.local` and populate your credentials:
```bash
cp .env.example .env.local
```

### 4. Apply Database Migrations
Apply all SQL migrations in `supabase/migrations/` sequentially through the Supabase SQL Editor or Supabase CLI:
```bash
npx supabase db push
```

### 5. Seed Demo Data
Populate standard test accounts, departments, doctors, rooms, and pharmacy inventory:
```bash
npm run seed:demo
```

### 6. Run the Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🔑 15. Environment Variables Reference

| Variable Name | Required | Scope | Description |
| :--- | :---: | :---: | :--- |
| `NEXT_PUBLIC_SUPABASE_URL` | **Yes** | Client/Server | URL of your Supabase instance |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | **Yes** | Client/Server | Public anonymous key for Supabase Auth |
| `SUPABASE_SERVICE_ROLE_KEY` | **Yes** | Server-only | Secret service role key for admin operations |
| `GEMINI_API_KEY` | Optional | Server-only | Google Gemini API key for AI symptom features |
| `EMAIL_PROVIDER` | Optional | Server-only | `resend`, `sendgrid`, or `stub` (default: `stub`) |
| `RESEND_API_KEY` | Optional | Server-only | Resend API key (`re_...`) for email delivery |
| `EMAIL_FROM` | Optional | Server-only | Sender email address (e.g. `onboarding@resend.dev`) |
| `GOOGLE_CLIENT_ID` | Optional | Server-only | Google OAuth 2.0 Client ID for Calendar sync |
| `GOOGLE_CLIENT_SECRET` | Optional | Server-only | Google OAuth 2.0 Client Secret |
| `GOOGLE_REDIRECT_URI` | Optional | Server-only | OAuth redirect callback URL |
| `ENCRYPTION_SALT` | Optional | Server-only | Salt/key for AES-256 OAuth token encryption |
| `APPOINTMENT_HOLD_DURATION_SECONDS` | Optional | Server-only | Slot hold expiry duration (default: `300`) |

---

## 👥 16. Demo Accounts Section

When seeded with `npm run seed:demo`, the following pre-configured demo accounts are available:

| Role | Email | Password | Primary Workspace |
| :--- | :--- | :--- | :--- |
| **Administrator** | `demo-admin@hms.local` | `DemoAdmin123!` | `/admin` |
| **Doctor** | `demo-doctor@hms.local` | `DemoDoctor123!` | `/doctor` |
| **Nurse** | `demo-nurse@hms.local` | `DemoNurse123!` | `/nurse` |
| **Pharmacist** | `demo-pharmacist@hms.local` | `DemoPharm123!` | `/pharmacy` |
| **Patient** | `demo-patient@hms.local` | `DemoPatient123!` | `/patient` |

---

## 🔌 17. API Documentation Overview

### Core Healthcare Endpoints

| Method | Endpoint | Description | Permitted Roles |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/specialties` | List medical specialties & doctor counts | Public / Authenticated |
| `GET` | `/api/doctors` | List active doctors filtered by department | Public / Authenticated |
| `GET` | `/api/doctors/[id]/slots` | Get available bookable slots for doctor | Public / Authenticated |
| `POST` | `/api/appointments/hold` | Temporarily hold a slot (5 minutes) | `Patient`, `Admin` |
| `POST` | `/api/appointments/confirm` | Confirm an active slot hold | `Patient`, `Admin` |
| `POST` | `/api/appointments/[id]/cancel` | Cancel a scheduled appointment | `Patient`, `Doctor`, `Admin` |
| `POST` | `/api/appointments/[id]/reschedule` | Reschedule to a newly held slot | `Patient`, `Admin` |
| `POST` | `/api/symptoms` | Submit pre-visit symptoms for AI intake | `Patient` |
| `GET` | `/api/ai/previsit` | Retrieve AI pre-visit intake summary | `Patient`, `Doctor` |
| `POST` | `/api/post-visit-notes` | Record doctor consultation notes | `Doctor` |
| `POST` | `/api/prescriptions` | Issue new patient prescription | `Doctor` |
| `POST` | `/api/doctor-leave` | Submit and process doctor leave | `Doctor`, `Admin` |
| `GET` | `/api/dashboard/stats` | Retrieve hospital-wide metrics | `Admin` |
| `POST` | `/api/notifications/retry` | Trigger retry of failed notifications | `Admin` / Cron |

---

## 🧪 18. Testing Commands & Quality Assurance

The codebase includes an extensive Vitest automated test suite covering all critical business domains:

```bash
# Run all automated tests
npm test

# Run tests in watch mode
npx vitest

# Run TypeScript type check
npx tsc --noEmit

# Run ESLint validation
npm run lint
```

### Verified Test Suites
- `tests/appointment-flow.test.ts`: Slot generation, atomic holding, concurrent hold contention, idempotency, and cancellation.
- `tests/ai-features.test.ts`: Pre-visit intake processing, Zod schema validation, and API failure fallbacks.
- `tests/notifications-calendar.test.ts`: Email delivery, deduplication keys, and AES-256 token encryption.
- `tests/doctor-leave.test.ts`: Overlapping leave detection and appointment conflict resolution.
- `tests/analytics.test.ts`: Departmental revenue, demographics, and visit trend computations.
- `tests/staff.test.ts`: Staff provisioning, role assignment, and validation.
- `tests/auth.test.ts`: RBAC permission guards and session verification.

---

## 📦 19. Build & Deployment Instructions

### Production Build
To create an optimized production build:
```bash
npm run build
```

### Starting Production Server
```bash
npm run start
```

### Deployment Guidelines (Vercel / Node.js Host)
1. Link your GitHub repository to **Vercel** or your chosen hosting provider.
2. Set the root directory to `./`.
3. Add all required environment variables in your deployment dashboard (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`, `RESEND_API_KEY`, etc.).
4. Ensure your Supabase database migrations are applied before deploying the application.

---

## ⚠️ Medical Disclaimer
This software is built for educational and operational management purposes. It is **not** a certified medical diagnostic device. AI-generated insights are intended solely to assist clinical workflows and must not supersede the professional judgment of qualified healthcare providers.

---

## 📄 License
This project is licensed under the MIT License.
