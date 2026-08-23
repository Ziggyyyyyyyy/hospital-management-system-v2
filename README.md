# 🏥 Hospital Management System (HMS)

### Production-Oriented Healthcare Appointment, Clinical Workflow & Operations Platform

[![Next.js](https://img.shields.io/badge/Next.js-16.3.2-black?logo=next.js)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-v4-06B6D4?logo=tailwindcss)](https://tailwindcss.com/)
[![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-3ECF8E?logo=supabase)](https://supabase.com/)
[![Google Gemini](https://img.shields.io/badge/Google_Gemini-AI-4285F4?logo=google)](https://ai.google.dev/)
[![Vitest](https://img.shields.io/badge/Testing-Vitest-6E9F18?logo=vitest)](https://vitest.dev/)
[![Vercel](https://img.shields.io/badge/Deployed_on-Vercel-black?logo=vercel)](https://vercel.com/)

A full-stack healthcare management platform designed around **safe appointment concurrency, doctor availability and leave handling, AI-assisted clinical documentation, reliable notifications, pharmacy workflows, billing, and Google Calendar synchronization.**

The system is designed as a production-oriented implementation rather than a simple CRUD application, with particular focus on **transaction safety, failure isolation, role-based access control, and reliable external integrations.**

---

## 🌐 Live Demo

### 🚀 Hosted Application

**[Open HMS Live Demo](https://hospital-management-system-v2-ashy.vercel.app/)**

### 💻 Source Code

**[GitHub Repository](https://github.com/Ziggyyyyyyyy/hospital-management-system-v2)**

The application is deployed on **Vercel** and uses **Supabase PostgreSQL and authentication**.

---

# 🎯 1. Problem Statement

Healthcare appointment systems involve significantly more than basic appointment booking.

A reliable healthcare platform needs to handle:

- Multiple patients attempting to book the same slot simultaneously
- Temporary reservations while patients complete the booking process
- Doctor working hours, breaks, availability and leave
- Existing appointments affected by doctor leave
- AI-generated clinical summaries
- Failures from external AI and email providers
- Appointment reminders
- Google Calendar synchronization
- Role-specific access to sensitive healthcare workflows
- Pharmacy, admissions, records and billing operations

The **Hospital Management System (HMS)** brings these workflows together into a single role-based platform.

### Core Design Principle

> **Critical healthcare state transitions remain transactional and deterministic, while external services such as AI, email and Google Calendar are isolated so their failures do not break core appointment workflows.**

---

# 👥 2. User Roles

The platform provides dedicated workspaces for five operational roles.

| Role | Responsibilities |
|---|---|
| 👤 **Patient** | Doctor discovery, symptom intake, appointment booking, records and billing |
| 👨‍⚕️ **Doctor** | Availability, leave, consultations, prescriptions and patient records |
| 👩‍⚕️ **Nurse** | Admissions, assigned patients and inpatient workflows |
| 💊 **Pharmacist** | Medicine inventory, dispensing and stock management |
| 🛡️ **Admin** | Doctors, staff, rooms, billing, operations and analytics |

---

# ✨ 3. Key Features

## 🔐 Role-Based Access Control

- Supabase authentication
- JWT-backed sessions
- Role-specific dashboards
- API-level authorization
- Resource ownership checks
- PostgreSQL Row Level Security (RLS)
- Server-side secret handling
- Request validation

Authorization is enforced at the API/service layer rather than relying only on frontend visibility.

---

## 📅 Concurrency-Safe Appointment Scheduling

Appointment booking is the most concurrency-sensitive workflow in the application.

A naive implementation such as:

```text
is unsafe because two patients can read the same available slot before either request commits.

The system therefore uses database-level concurrency control.

Booking Lifecycle
Doctor Availability
        │
        ▼
Slot Generation
        │
        ▼
Patient selects slot
        │
        ▼
Temporary Slot Hold
        │
        ├── Availability validation
        ├── PostgreSQL advisory locking
        ├── Hold ownership
        └── Expiry timestamp
        │
        ▼
Patient confirms booking
        │
        ▼
Atomic Confirmation
        │
        ├── Validate hold
        ├── Validate ownership
        ├── Prevent duplicate confirmation
        └── Transition slot → BOOKED
        │
        ▼
Appointment Created
Double-Booking Prevention

The system uses:

PostgreSQL advisory locks
Row-level locking
Transactional operations
Atomic database RPCs
Slot ownership validation
Temporary hold expiration
Idempotent booking confirmation
Appointment state-transition validation

This ensures simultaneous booking attempts are handled deterministically.

⏱️ 4. Temporary Slot Hold Mechanism

Before final appointment confirmation, a selected slot can be temporarily held.

Default Hold Duration

5 minutes

The hold prevents another patient from acquiring the same slot while the current patient completes the booking process.

Hold Lifecycle
Double-Booking Prevention

The system uses:

PostgreSQL advisory locks
Row-level locking
Transactional operations
Atomic database RPCs
Slot ownership validation
Temporary hold expiration
Idempotent booking confirmation
Appointment state-transition validation

This ensures simultaneous booking attempts are handled deterministically.

⏱️ 4. Temporary Slot Hold Mechanism

Before final appointment confirmation, a selected slot can be temporarily held.

Default Hold Duration

5 minutes

The hold prevents another patient from acquiring the same slot while the current patient completes the booking process.

Hold Lifecycle
Important properties:

Hold belongs to a specific user/session
Hold has an expiration timestamp
Expired holds do not permanently block slots
Confirmation validates the hold before booking
Duplicate confirmations are protected

The database layer contains atomic operations for slot holding and confirmation.

👨‍⚕️ 5. Doctor Availability & Leave Management

Admins can configure doctor:

Specialization
Working hours
Break periods
Slot duration
Recurring availability
Leave dates

Slots are generated according to the configured availability.

🚨 Doctor Leave Conflict Handling

Doctor leave becomes more complex when appointments already exist for the affected date.

The system does not simply mark the doctor unavailable.
Instead:
Doctor Leave Created
        │
        ▼
Conflict Detection
        │
        ├── Identify affected appointments
        ├── Block unavailable slots
        ├── Release relevant holds
        └── Prepare affected patients
        │
        ▼
Conflict Resolution
        │
        ▼
Patient Notifications
This prevents a state where:
Doctor = ON LEAVE
        +
Appointment = ACTIVE
        +
Patient = NOT INFORMED
The leave workflow therefore explicitly handles existing appointment conflicts.

🤖 6. AI-Assisted Clinical Documentation

Google Gemini is integrated into two clinical documentation workflows.

🧠 Pre-Visit AI Summary

Before an appointment, the patient can provide symptom information.

The system uses this information to generate a structured pre-visit summary for the doctor.

Structured Output
Urgency Level
Chief Complaint
Suggested Questions
The expected structure is:
{
  "urgency": "LOW | MEDIUM | HIGH",
  "chief_complaint": "...",
  "suggested_questions": [
    "...",
    "...",
    "..."
  ]
}
The generated summary is persisted and associated with the relevant appointment.

The AI is used as a documentation and preparation aid, not as a replacement for clinical judgment.

📝 Post-Visit AI Summary

After a consultation, the doctor can provide:

Clinical notes
Diagnosis
Prescription information
Follow-up instructions

Gemini converts the clinical information into a patient-friendly summary.

Structured Output
The generated summary is persisted and associated with the relevant appointment.

The AI is used as a documentation and preparation aid, not as a replacement for clinical judgment.

📝 Post-Visit AI Summary

After a consultation, the doctor can provide:

Clinical notes
Diagnosis
Prescription information
Follow-up instructions

Gemini converts the clinical information into a patient-friendly summary.

Structured Output
Visit Explanation
Medication Schedule
Follow-Up Steps
Instructions
The generated result is persisted for later access by the patient.

🛡️ 7. LLM Failure Handling

AI is intentionally treated as a non-critical external dependency.

An AI failure must not break the appointment or clinical workflow.

The system handles:

Missing Gemini API key
Provider/API failure
Network failure
Invalid model response
Malformed JSON
Unexpected output format
Schema validation failure
AI processing failure
Patient AI-consent opt-out
Failure Isolation
Healthcare Workflow
        │
        ├──────────────► Core operation continues
        │
        ▼
    AI Processing
        │
    ┌───┴────┐
    │        │
 SUCCESS   FAILURE
    │        │
    ▼        ▼
 Persist   Record Failure
    │        │
    ▼        ▼
 Continue   Graceful Fallback
AI output is validated before persistence using runtime schemas.

Malformed model responses therefore cannot directly corrupt persisted application data.

Detailed AI prompt workflows are documented in:

docs/LLM_PROMPTS.md

📬 8. Reliable Notification System

Notifications are decoupled from critical appointment transactions.

Supported notifications include:

Appointment booking confirmation
Appointment cancellation
Appointment rescheduling
Doctor leave conflict notification
AI summary notification
Appointment reminders
Medication reminders
🔄 Notification Outbox Pattern

Instead of making the main appointment transaction depend on email delivery:
Appointment Transaction
        │
        ▼
Notification Record
        │
        ▼
Notification Processor
        │
    ┌───┴────┐
    │        │
 SUCCESS   FAILURE
    │        │
    ▼        ▼
   SENT     RETRY
              │
              ▼
       Exponential Backoff
A provider failure therefore does not roll back a successfully created appointment.

Failure Tracking

Notifications can track:
status
attempt count
last attempt
next retry
deduplication key
provider message ID
This provides a reliable foundation for retry processing and prevents unnecessary duplicate notifications.

📆 9. Google Calendar Integration

The application integrates Google Calendar using OAuth 2.0.

Appointment Booking
Appointment Confirmed
        │
        ▼
Google Calendar Event
        │
        ├── Patient
        └── Doctor
Rescheduling

When an appointment is rescheduled, the corresponding Google Calendar event is updated.

Cancellation

When an appointment is cancelled, the corresponding Google Calendar event is removed.

OAuth Security

OAuth-related tokens are encrypted using:
AES-256-GCM
before being persisted.

Google Calendar operations are isolated from the critical appointment transaction so external API failures do not invalidate the appointment itself.

Detailed setup instructions:

docs/GOOGLE_CALENDAR_SETUP.md
💊 10. Pharmacy Management

The pharmacy module supports:

Medicine inventory
Stock categorization
Low-stock monitoring
Prescription-based dispensing
Restocking workflows
Inventory transaction tracking
Medication reminders
💳 11. Billing & Invoicing

The billing module supports:

Consultation charges
Medicine charges
Room charges
Laboratory charges
Multiple billing items
Invoice management
Payment status tracking
🏥 12. Admissions & Inpatient Workflows

The system supports inpatient operational workflows including:

Patient admission
Room management
Nurse assignment
Assigned-patient workflows
Admission status tracking

This allows the platform to cover both appointment-based and inpatient operational use cases.

📊 13. Hospital Analytics

The admin dashboard provides operational metrics including:

Revenue by department
Visit statistics
Patient demographics
Gender distribution
Blood-group distribution
Medicine consumption
Operational statistics

Analytics are exposed through dedicated API endpoints.
🏗️ 14. System Architecture
                         ┌──────────────────────────┐
                         │      Client Layer        │
                         │                          │
                         │ Next.js + React          │
                         │ TypeScript + Tailwind    │
                         └────────────┬─────────────┘
                                      │
                                      ▼
                         ┌──────────────────────────┐
                         │     API / Route Layer    │
                         │                          │
                         │ Auth / RBAC / Validation │
                         └────────────┬─────────────┘
                                      │
                                      ▼
              ┌────────────────────────────────────────────┐
              │              Domain Services                │
              │                                            │
              │ Appointment & Slot Management               │
              │ Doctor Availability & Leave                 │
              │ AI Clinical Documentation                   │
              │ Notification Outbox & Retry                 │
              │ Google Calendar Integration                 │
              │ Billing & Pharmacy                          │
              │ Admissions & Records                        │
              │ Medication Reminders                        │
              └─────────────────────┬──────────────────────┘
                                    │
                                    ▼
              ┌────────────────────────────────────────────┐
              │              Supabase PostgreSQL            │
              │                                            │
              │ RLS / Transactions / Constraints           │
              │ RPCs / Advisory Locks / Row Locks          │
              │ State Transition Guards                    │
              └─────────────────────┬──────────────────────┘
                                    │
                 ┌──────────────────┼──────────────────┐
                 ▼                  ▼                  ▼
          Google Gemini       Email Provider      Google Calendar
              AI              Resend/etc.             OAuth/API
🧩 15. Backend Module Structure
Module	Responsibility
Authentication	Identity and session management
RBAC	Role and resource authorization
Appointments	Booking, cancellation and rescheduling
Availability	Doctor schedules and slot generation
Doctor Leave	Leave management and conflict detection
Slot Holds	Temporary reservation and expiry
AI	Pre/post-visit intelligence
Notifications	Outbox, delivery and retries
Calendar	OAuth and event synchronization
Billing	Invoice and billing workflows
Pharmacy	Inventory and dispensing
Admissions	Inpatient workflows
Records	Patient clinical records
Reminders	Appointment and medication reminders
Analytics	Hospital operational metrics
🗄️ 16. Database Design

The application uses Supabase PostgreSQL.

The database design includes:

Relational tables
PostgreSQL enums
Foreign-key relationships
Unique constraints
Check constraints
Indexes
Row Level Security
PostgreSQL functions
Atomic concurrency RPCs
Appointment state-transition protection
Core Entities
users
patients
medical_staff
departments
specialties

doctor_availability
doctor_leave
appointment_slots
slot_holds
appointments

symptom_intakes
ai_previsit_summaries
post_visit_notes
post_visit_summaries

medical_records
prescriptions
prescription_items

medicine_stock
medicine_dispense
medication_reminders

rooms
admissions

billing
billing_items

notifications
user_oauth_tokens
calendar_events
audit_logs
Detailed database documentation:

docs/DATABASE.md
🔌 17. API Documentation

The application exposes API routes covering:

Authentication & Users
User identity
Patient profile
Staff profile
Admin user management
Doctors
Doctor discovery
Doctor availability
Doctor slots
Doctor leave
Conflict detection
Appointments
Slot generation
Slot holds
Booking
Confirmation
Cancellation
Rescheduling
Clinical Workflows
Symptoms
AI pre-visit summaries
Post-visit notes
AI post-visit summaries
Prescriptions
Medical records
Hospital Operations
Admissions
Rooms
Nurse assignment
Pharmacy
Billing
Integrations
Notifications
Notification retries
Google Calendar OAuth
Calendar synchronization
Analytics
Revenue
Visits
Demographics
Medicine statistics
Department metrics

Complete API reference:

docs/API.md
🧠 18. LLM Prompt Documentation

AI prompt workflows are documented separately to make the LLM behavior reproducible and reviewable.

docs/LLM_PROMPTS.md

The documentation covers:

Pre-visit prompt
Post-visit prompt
Input structure
Expected output
Validation schemas
Persistence behavior
Failure handling
Notification behavior
Pre-Visit AI
Patient Symptoms
      ↓
LLM Processing
      ↓
Urgency
Chief Complaint
3 Suggested Questions
      ↓
Validated Structured Output
      ↓
Database Persistence
Post-Visit AI
Clinical Notes
Diagnosis
Prescription
Follow-Up Instructions
      ↓
LLM Processing
      ↓
Patient-Friendly Summary
      ↓
Validated Structured Output
      ↓
Database Persistence
🔐 19. Security Design

Healthcare systems require careful handling of authentication, authorization and sensitive data.

Security measures include:

Supabase authentication
JWT-backed sessions
Role-based authorization
PostgreSQL Row Level Security
Resource ownership checks
Server-side authorization
Zod request validation
Idempotency protection
PostgreSQL advisory locks
Transactional state transitions
Encrypted OAuth token storage
Environment-based secret management
Audit logging
Secret Management

Real credentials are never committed to source control.

The repository contains:
.env.example
only as a configuration template.

Actual credentials belong in local environment configuration or the deployment platform's environment variable manager.

⚙️ 20. Reliability & Failure Isolation

The system separates critical transactional workflows from external integrations.

Critical Operations

These must remain consistent:

Slot holds
Appointment confirmation
Appointment cancellation
Appointment rescheduling
Doctor leave processing
Database state transitions
Non-Critical External Operations

These may fail without invalidating core state:

AI generation
Email delivery
Google Calendar synchronization

This creates the following reliability boundary:
                 CORE TRANSACTION
                       │
              ┌────────┴────────┐
              │                 │
        Database State      Outbox/Event
              │                 │
              ▼                 ▼
        COMMIT SUCCESS      External Worker
                                │
                    ┌───────────┼───────────┐
                    ▼           ▼           ▼
                   AI         Email      Calendar
                    │           │           │
                 Failure     Failure     Failure
                    │           │           │
                    └───────────┴───────────┘
                                │
                                ▼
                         Retry / Record Failure
🧪 21. Testing & Quality Checks

Run the test suite:

npm test

Run TypeScript validation:

npx tsc --noEmit

Run linting:

npm run lint

Create a production build:

npm run build

The production build validates:

TypeScript compilation
Next.js compilation
Route generation
Static page generation
Server-side modules
Production bundling
📦 22. Demo Dataset

The repository contains scripts for creating and cleaning demonstration data.

Seed Demo Data
npx tsx scripts/seed-demo-dataset.ts
Clean Demo Data
npx tsx scripts/clean-demo-dataset.ts

A SQL seed file is also available:

supabase/demo_seed.sql

These files allow the application to be demonstrated without manually creating every record.

🚀 23. Local Setup
Prerequisites

Install:

Node.js
npm
Git
Supabase project
Clone Repository
git clone https://github.com/Ziggyyyyyyyy/hospital-management-system-v2.git
cd hospital-management-system-v2
Install Dependencies
npm install
Configure Environment
Windows PowerShell
Copy-Item .env.example .env.local
macOS / Linux
cp .env.example .env.local

Then configure the required values inside:

.env.local

Never commit .env.local.

Start Development Server
npm run dev

The application will be available locally at:

http://localhost:3000
🔑 24. Environment Variables

All required configuration variables are documented in:

.env.example

Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
AI
GEMINI_API_KEY=
Email
EMAIL_PROVIDER=
RESEND_API_KEY=
SENDGRID_API_KEY=
EMAIL_FROM=
Google Calendar
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=
Encryption
ENCRYPTION_MASTER_KEY=
ENCRYPTION_SALT=
Application
NEXT_PUBLIC_SITE_NAME=
NEXT_PUBLIC_SITE_URL=

APPOINTMENT_HOLD_DURATION_SECONDS=
APPOINTMENT_SLOT_GENERATION_DAYS_AHEAD=
APPOINTMENT_DEFAULT_TIMEZONE=
APPOINTMENT_REMINDER_HOURS_BEFORE=
MEDICATION_REMINDER_LOOKAHEAD_MINUTES=

Never put real API keys, passwords, OAuth secrets or encryption keys inside .env.example or Git.

📆 25. Google Calendar Setup

Google Calendar integration requires:

Google Cloud project
Google Calendar API
OAuth consent configuration
OAuth 2.0 credentials
Authorized redirect URI
Required environment variables

Detailed instructions:

docs/GOOGLE_CALENDAR_SETUP.md

The integration supports:

Offline OAuth authorization
Access token refresh
Encrypted refresh token storage
Calendar event creation
Event updates
Event deletion
🏗️ 26. Production Deployment

The application is deployed using Vercel.

Deployment Flow
GitHub Repository
       │
       ▼
     Vercel
       │
       ├── Install Dependencies
       ├── Build Next.js Application
       ├── Inject Environment Variables
       └── Deploy
              │
              ▼
        Production HMS
Current Production URL

https://hospital-management-system-v2-ashy.vercel.app/

Deployment Configuration
Import the GitHub repository into Vercel.
Select the Next.js framework preset.
Configure environment variables.
Configure Supabase credentials.
Configure Gemini credentials if AI is enabled.
Configure email provider credentials.
Configure Google OAuth redirect URI if Calendar integration is enabled.
Deploy.
📚 27. Project Documentation
File	Purpose
README.md	Complete project overview and setup
docs/API.md	API endpoint documentation
docs/DATABASE.md	Database schema and database logic
docs/LLM_PROMPTS.md	AI prompt workflows and validation
docs/GOOGLE_CALENDAR_SETUP.md	Google OAuth and Calendar setup
docs/SYSTEM_DESIGN.md	Architecture and reliability decisions
.env.example	Environment configuration template
📐 28. System Design Highlights

The system design focuses on four high-risk workflows.

Double-Booking Prevention

Appointment booking is protected using transactional database operations, advisory locking, row-level locking, temporary slot holds and idempotent confirmation.

Doctor Leave Conflict Handling

Doctor leave triggers conflict detection for existing appointments. Affected appointments are identified and patients can be notified rather than leaving inconsistent scheduling state.

Slot Hold Mechanism

Selected slots are temporarily held for a limited duration. Holds are ownership-aware and expire automatically, preventing abandoned booking sessions from blocking availability.

Notification Failure Handling

Notifications are persisted independently from core transactions. Failed deliveries are tracked and retried using backoff, ensuring email provider failures do not roll back successful appointments.

Full system design:

docs/SYSTEM_DESIGN.md

📦 29. Assignment Deliverables

This repository contains the requested deliverables:

1. Complete Source Code

Full application source code is available in the GitHub repository.

2. Documentation

Included:

README
.env.example
API documentation
Database schema
LLM prompts
Google Calendar setup
System design
3. Hosted Application

https://hospital-management-system-v2-ashy.vercel.app/

4. System Design

The system design covers:

Double-booking prevention
Doctor leave conflict handling
Slot hold mechanism
Notification failure handling
🧠 30. Engineering Decisions

This project focuses on engineering problems that are easy to get wrong in real-world systems.

Concurrency

Availability checks alone are insufficient for appointment booking. Database-level locking and transactions are used to protect critical state transitions.

Temporary Reservations

Slot holds prevent users from losing a selected slot during the confirmation flow while ensuring abandoned holds eventually expire.

Reliability

External email, AI and Calendar services are isolated from core appointment transactions.

AI Validation

LLM output is validated before persistence, and AI failures are handled without blocking core healthcare workflows.

Data Consistency

Appointment and slot state transitions are protected through transactional database logic.

Security

Authentication, RBAC, RLS, ownership validation, encrypted OAuth credentials and server-side secrets protect sensitive workflows.

Integration Resilience

External services are treated as unreliable dependencies rather than trusted components of the core transaction.
📁 31. Repository Structure
hospital-management-system-v2/
│
├── app/
│   ├── admin/
│   ├── doctor/
│   ├── nurse/
│   ├── patient/
│   ├── pharmacy/
│   └── api/
│
├── components/
│   ├── admin/
│   ├── appointments/
│   ├── doctor/
│   ├── nurse/
│   ├── patient/
│   ├── pharmacy/
│   └── shell/
│
├── lib/
│   ├── ai/
│   ├── appointments/
│   ├── calendar/
│   ├── crypto/
│   ├── medications/
│   └── ...
│
├── docs/
│   ├── API.md
│   ├── DATABASE.md
│   ├── GOOGLE_CALENDAR_SETUP.md
│   ├── LLM_PROMPTS.md
│   └── SYSTEM_DESIGN.md
│
├── scripts/
│   ├── clean-demo-dataset.ts
│   └── seed-demo-dataset.ts
│
├── supabase/
│   └── demo_seed.sql
│
├── .env.example
├── package.json
├── README.md
└── tsconfig.json
⚠️ 32. Clinical Disclaimer

This project is an educational software implementation and is not a medical diagnosis or treatment system.

AI-generated summaries are intended only as documentation and communication aids.

Clinical decisions remain the responsibility of qualified healthcare professionals.

👩‍💻 Author
Aditi Srivastava

B.Tech Computer Science & Engineering
VIT Bhopal University

⭐ Project Focus
Concurrency
     +
Reliability
     +
AI-Assisted Workflows
     +
Secure Authorization
     +
Database Consistency
     +
External API Resilience
