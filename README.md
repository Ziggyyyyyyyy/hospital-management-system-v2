# 🏥 Hospital Management System (HMS)

**Production-oriented, full-stack healthcare operations platform for appointments, clinical workflows, AI-assisted documentation, pharmacy, billing, notifications, and calendar synchronization.**

[![Next.js](https://img.shields.io/badge/Next.js-16.3.2-black?logo=next.js)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-v4-06B6D4?logo=tailwindcss)](https://tailwindcss.com/)
[![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-3ECF8E?logo=supabase)](https://supabase.com/)
[![Gemini](https://img.shields.io/badge/Google_Gemini-AI-4285F4?logo=google)](https://ai.google.dev/)
[![Vitest](https://img.shields.io/badge/Vitest-Testing-6E9F18?logo=vitest)](https://vitest.dev/)

---

## 🌐 Live Demo

### [Launch Hospital Management System →](https://hospital-management-system-v2-ashy.vercel.app/)

**Hosted application:**  
https://hospital-management-system-v2-ashy.vercel.app/

**Source code:**  
https://github.com/Ziggyyyyyyyy/hospital-management-system-v2

The application is deployed on Vercel and uses Supabase PostgreSQL for persistence and authentication.

> **Note:** The hosted application is a demonstration environment. Do not enter real patient information or production healthcare data.

---

## 🎯 Problem Statement

Hospital workflows frequently become fragmented across appointment scheduling, doctor availability, patient records, admissions, pharmacy inventory, billing, notifications, and clinical documentation.

HMS provides a unified role-based platform that connects these workflows while focusing on the backend problems that make healthcare scheduling difficult:

- Preventing simultaneous users from booking the same appointment slot
- Temporarily reserving slots during checkout
- Handling doctor leave without leaving conflicting appointments unresolved
- Delivering notifications reliably when external providers fail
- Supporting AI-assisted clinical documentation without making AI availability a hard dependency
- Synchronizing confirmed appointments with Google Calendar
- Protecting sensitive credentials and OAuth tokens

---

# ✨ Core Features

## 🔐 Role-Based Healthcare Workspaces

HMS supports five operational roles:

| Role | Core Responsibilities |
|---|---|
| **Admin** | Staff, doctors, nurses, rooms, billing and hospital analytics |
| **Doctor** | Availability, schedules, leave, consultations, medical records and prescriptions |
| **Nurse** | Admissions, assigned patients and inpatient workflows |
| **Patient** | Doctor discovery, appointment booking, records and billing |
| **Pharmacist** | Medicine inventory, prescriptions, dispensing and stock management |

Authentication is handled through Supabase Auth with server-side authorization and role-aware API access.

---

## 📅 Concurrency-Safe Appointment Scheduling

Appointment booking is designed as a transactional workflow rather than a simple client-side availability check.

The system supports:

- Dynamic slot generation
- Temporary slot holds
- PostgreSQL advisory locks
- Row-level locking using `FOR UPDATE`
- Atomic database RPCs
- Slot ownership validation
- Hold expiration
- Idempotent confirmation
- Appointment state-transition validation
- Double-booking prevention

### Booking Lifecycle

```text
Available Slot
      │
      ▼
┌──────────────────────┐
│  atomic_hold_slot    │
│  + advisory lock     │
│  + hold_token        │
└──────────┬───────────┘
           │
           ▼
      HELD / Temporary
           │
           ├──────────────► Hold expires
           │                     │
           │                     ▼
           │                  AVAILABLE
           │
           ▼
┌──────────────────────────┐
│ atomic_confirm_booking   │
│                          │
│ Validate hold            │
│ Validate ownership       │
│ Prevent duplicate        │
│ Confirm transaction      │
└────────────┬─────────────┘
             │
             ▼
        BOOKED
Double-Booking Prevention

The system does not rely solely on the frontend to determine whether a slot is available.

The reservation pipeline uses:

PostgreSQL advisory locks to serialize concurrent operations for the same scheduling resource.
Row-level locking / FOR UPDATE where required during transactional operations.
Atomic database RPCs for reservation and confirmation.
Temporary hold ownership using a server-generated hold_token.
Expiration validation to prevent stale reservations.
Idempotent confirmation to prevent duplicate processing.
Appointment state validation before state transitions.

This makes simultaneous booking attempts deterministic at the database boundary.

⏱️ Temporary Slot Hold Mechanism

A selected appointment slot can be temporarily reserved before final confirmation.

Default hold duration: 5 minutes.

The hold mechanism:

Creates a temporary reservation
Associates the hold with a unique hold_token
Prevents another patient from acquiring the held slot
Validates the token during confirmation
Rejects expired holds
Releases stale reservations automatically through expiry logic
Converts a valid hold into a confirmed appointment atomically

This prevents a patient from losing a slot while completing the booking process while also preventing indefinite slot occupation.

👨‍⚕️ Doctor Leave & Conflict Handling

Doctor leave is treated as a scheduling event rather than simply a calendar flag.

When leave overlaps existing appointments, the backend processes the affected appointments through the process_doctor_leave_conflicts database workflow.

The workflow:

Doctor Leave Created
        │
        ▼
Find Overlapping Appointments
        │
        ▼
Block Affected Bookable Slots
        │
        ▼
Identify Patient Conflicts
        │
        ▼
Update / Handle Conflicting Appointments
        │
        ▼
Create Notifications
        │
        ▼
Patient Can Reschedule

This prevents newly generated slots from remaining bookable during leave and provides a controlled path for already-booked patients.

🤖 AI-Assisted Clinical Documentation

HMS uses Google Gemini for structured AI-assisted clinical workflows.

Pre-Visit AI

The pre-visit pipeline can process patient symptom information to produce structured information such as:

Chief complaint
Symptom analysis
Urgency classification
Suggested questions for the doctor

The workflow uses structured output validation rather than treating raw model text as trusted application data.

Post-Visit AI

After a consultation, the post-visit workflow can generate structured clinical documentation and consultation summaries.

AI processing is intentionally non-blocking for core appointment and clinical workflows. If the AI provider fails, the underlying healthcare workflow can continue and the failure can be handled through the application's recovery mechanisms.

Patient consent and opt-out behavior are also considered in the AI pipeline.

📬 Reliable Notification Architecture

Notifications are decoupled from critical database transactions using an outbox pattern.

Instead of making booking success depend directly on an external email provider:

Business Transaction
        │
        ▼
Create Outbox Event
        │
        ▼
Transaction Commits
        │
        ▼
Background Processing
        │
        ├──► Provider succeeds
        │
        └──► Provider fails
                  │
                  ▼
             Retry / Backoff

The notification subsystem supports:

Booking confirmations
Cancellation notifications
Rescheduling notifications
Doctor leave conflict notifications
AI-related notifications
Outbox persistence
dedupe_key based deduplication
Failure tracking
Retry processing
Exponential backoff
Resend integration
Stub provider support for development/testing
Why the Outbox Pattern?

External email providers can fail independently of the database.

Keeping notification delivery outside the critical transaction means:

A temporary email-provider failure should not roll back a successful appointment transaction.

📆 Google Calendar Integration

HMS integrates with Google Calendar using OAuth 2.0.

Supported lifecycle operations include:

OAuth authorization
Offline access
Appointment event creation
Appointment rescheduling synchronization
Appointment cancellation synchronization
Attendee email invitations

The authorization flow uses:

/api/calendar/authorize
        │
        ▼
Google OAuth Consent
        │
        ▼
/api/calendar/callback
        │
        ▼
Authorization Code Exchange
        │
        ▼
Encrypted Token Persistence
        │
        ▼
Automatic Access Token Refresh

OAuth refresh tokens are encrypted using AES-256-GCM before database persistence.

The encryption envelope follows the application's documented versioned format:

v1:<iv>:<tag>:<ciphertext>

See docs/GOOGLE_CALENDAR_SETUP.md for the complete setup procedure.

🏗️ System Architecture
🔄 Request Lifecycle

A typical API request follows a layered execution model:

Client UI
   │
   ▼
Route Handler
   │
   ├── Authenticate user
   ├── Resolve role
   └── Validate request with Zod
   │
   ▼
Domain Service
   │
   ├── Business rules
   ├── Authorization checks
   ├── Idempotency
   └── External integrations
   │
   ▼
Supabase Persistence
   │
   ├── PostgreSQL
   ├── RLS
   ├── Transactions
   ├── Locks
   └── Atomic RPCs

This separation keeps HTTP concerns, business logic, and database-level consistency responsibilities distinct.

🛡️ Security Architecture

Security-sensitive operations are handled server-side.

Key controls include:

Supabase authentication
Role-based authorization
PostgreSQL Row Level Security (RLS)
Server-side service-client boundaries
Zod request validation
Resource ownership checks
Idempotency protection
PostgreSQL transactional guarantees
Advisory locking for concurrent scheduling
AES-256-GCM encryption for OAuth tokens
Environment-based secret configuration
No real credentials committed to source control

Sensitive values belong in environment variables and must never be committed to Git.

🗄️ Database Design

The system uses Supabase PostgreSQL with relational tables, enums, RLS policies, triggers, functions, and transactional RPCs.

The database layer contains approximately 30 tables and 6 enums, with scheduling consistency enforced through database-level operations.

Important database responsibilities include:

Users and role relationships
Doctors and availability
Doctor leave
Appointment lifecycle
Slot reservations
Patients
Medical records
Admissions
Prescriptions
Medicines
Billing
Notifications
OAuth token storage
Outbox events
Analytics data

Database documentation:

docs/DATABASE.md

🧠 Critical Design Decisions
Problem	Design
Concurrent booking	PostgreSQL advisory locks + transactional operations
Row contention	FOR UPDATE row-level locking
Slot checkout	Temporary 5-minute hold
Hold ownership	Unique hold_token validation
Duplicate confirmation	Idempotent booking confirmation
Doctor leave	process_doctor_leave_conflicts
Email failures	Transactional outbox
Duplicate notifications	dedupe_key
Provider failures	Retry + exponential backoff
AI provider failure	Non-blocking fallback behavior
OAuth token security	AES-256-GCM encryption
API validation	Zod schemas
Data isolation	PostgreSQL RLS
💊 Pharmacy Management

The pharmacy module supports:

Medicine inventory
Stock tracking
Medicine categorization
Prescription-based dispensing
Low-stock monitoring
Inventory transactions
Restocking workflows

Dispensing is integrated with prescriptions and inventory state rather than being treated as an isolated UI operation.

💳 Billing

The billing module supports multiple hospital billing categories, including:

Consultation
Medicine
Room
Laboratory
Multi-item invoices
Payment status tracking

Billing information is surfaced according to the authenticated user's role and access permissions.

📊 Hospital Analytics

The administrative dashboard provides operational metrics including:

Revenue by department
Visits by department
Patient demographics
Blood-group distribution
Medicine quantities
Item-type counts
Hospital dashboard statistics
🧪 Testing & Verification

The project includes automated tests using Vitest.

Verification includes:

npm test

TypeScript verification:

npx tsc --noEmit

Production build:

npm run build

The documented verification baseline includes 75 passing tests across 7 test suites.

🛠️ Tech Stack
Layer	Technology
Frontend	Next.js, React, TypeScript
Styling	Tailwind CSS
Backend	Next.js Route Handlers / Domain Services
Authentication	Supabase Auth
Database	PostgreSQL via Supabase
Validation	Zod
AI	Google Gemini API
Email	Resend / provider abstraction
Calendar	Google Calendar API
Encryption	AES-256-GCM
Testing	Vitest
Deployment	Vercel
📁 Project Structure
hospital-management-system-v2/
│
├── app/
│   ├── admin/
│   ├── doctor/
│   ├── nurse/
│   ├── patient/
│   ├── pharmacy/
│   ├── api/
│   └── ...
│
├── components/
│   ├── admin/
│   ├── appointments/
│   ├── doctor/
│   ├── nurse/
│   ├── patient/
│   ├── pharmacy/
│   └── ...
│
├── lib/
│   ├── ai/
│   ├── appointments/
│   ├── calendar/
│   ├── crypto/
│   ├── medications/
│   └── ...
│
├── supabase/
│   ├── migrations/
│   └── demo_seed.sql
│
├── scripts/
│   ├── clean-demo-dataset.ts
│   └── seed-demo-dataset.ts
│
├── docs/
│   ├── API.md
│   ├── DATABASE.md
│   ├── GOOGLE_CALENDAR_SETUP.md
│   ├── LLM_PROMPTS.md
│   └── SYSTEM_DESIGN.md
│
├── package.json
├── .env.example
└── README.md
🚀 Local Development Setup
1. Clone the repository
git clone https://github.com/Ziggyyyyyyyy/hospital-management-system-v2.git
cd hospital-management-system-v2
2. Install dependencies
npm install
3. Configure environment variables

Create a local environment file:

cp .env.example .env.local

On Windows PowerShell:

Copy-Item .env.example .env.local

Fill the required values in .env.local.

Never commit .env.local.

4. Configure Supabase

Create/configure a Supabase project and provide the required Supabase URL and keys.

Apply the database migrations using the project's documented Supabase workflow.

5. Optional demo data

The repository includes demo dataset utilities:

npm run seed

If the project scripts differ in your local environment, refer to the available scripts in package.json.

6. Start development server
npm run dev

Open:

http://localhost:3000
🔑 Environment Variables

The complete safe template is available in .env.example.

Core configuration includes:

Variable	Purpose
NEXT_PUBLIC_SUPABASE_URL	Supabase project URL
NEXT_PUBLIC_SUPABASE_ANON_KEY	Supabase public client key
SUPABASE_SERVICE_ROLE_KEY	Server-only Supabase service key
GEMINI_API_KEY	Google Gemini API access
RESEND_API_KEY	Resend email provider
SENDGRID_API_KEY	Optional email provider configuration
EMAIL_PROVIDER	Email provider selection
EMAIL_FROM	Sender address
GOOGLE_CLIENT_ID	Google OAuth client ID
GOOGLE_CLIENT_SECRET	Google OAuth client secret
GOOGLE_REDIRECT_URI	Google OAuth callback URI
ENCRYPTION_MASTER_KEY	OAuth token encryption key
ENCRYPTION_SALT	Encryption key derivation/configuration
NEXT_PUBLIC_SITE_NAME	Application display name
NEXT_PUBLIC_SITE_URL	Application URL
APPOINTMENT_HOLD_DURATION_SECONDS	Temporary slot hold duration
APPOINTMENT_SLOT_GENERATION_DAYS_AHEAD	Slot generation window
APPOINTMENT_DEFAULT_TIMEZONE	Appointment timezone
APPOINTMENT_REMINDER_HOURS_BEFORE	Appointment reminder timing
MEDICATION_REMINDER_LOOKAHEAD_MINUTES	Medication reminder window

Use real credentials only in local or hosting-provider environment configuration.

📚 Documentation

The repository contains dedicated documentation for the major evaluation areas:

API Documentation

docs/API.md

Endpoint contracts, request/response behavior, and API details.

Database Documentation

docs/DATABASE.md

Schema, tables, enums, RPCs, constraints, and database behavior.

Google Calendar Setup

docs/GOOGLE_CALENDAR_SETUP.md

Google Cloud configuration, OAuth flow, redirect URI, token handling, and Calendar synchronization.

LLM Prompts

docs/LLM_PROMPTS.md

AI prompt contracts and structured pre/post-visit processing.

System Design

docs/SYSTEM_DESIGN.md

Detailed architecture and the four assignment-critical reliability mechanisms:

Double-booking prevention
Doctor leave conflict handling
Temporary slot holds
Notification failure handling
📐 Assignment-Critical Reliability Summary
1. Double-Booking Prevention

Concurrent booking attempts are serialized using PostgreSQL advisory locks, row-level locking, atomic RPCs, hold ownership validation, and transactional state transitions.

2. Doctor Leave Conflict Handling

process_doctor_leave_conflicts identifies appointments affected by doctor leave, prevents affected slots from remaining bookable, and initiates the required conflict-handling and notification workflow.

3. Temporary Slot Hold

A slot can be held for 5 minutes using a server-side hold and unique hold_token. Expired or invalid holds cannot be confirmed.

4. Notification Failure Handling

Notifications are persisted through an outbox workflow so external email-provider failures do not compromise the primary business transaction. Failed deliveries can be retried using deduplication and exponential backoff.

☁️ Deployment

The production application is deployed using Vercel.

Production URL

https://hospital-management-system-v2-ashy.vercel.app/

Deployment environment variables must be configured through the hosting provider rather than committed to the repository.

For Google Calendar production deployment, the OAuth redirect URI must correspond to the deployed application configuration.

🔒 Security & Privacy Notice

This repository contains configuration templates only.

Do not commit:

API keys
OAuth client secrets
Supabase service-role keys
Encryption master keys
Refresh tokens
Access tokens
Patient medical information
Real healthcare records

The included .env.example contains safe placeholders rather than production credentials.

📌 Engineering Highlights

This project demonstrates practical implementation of:

Full-stack Next.js architecture
Role-based authorization
PostgreSQL transaction design
Concurrency control
Advisory locks
Row-level locking
Idempotent APIs
Distributed-style outbox processing
Retry and exponential backoff
Secure OAuth token storage
AES-256-GCM encryption
Structured LLM integration
External API failure isolation
Database-level business invariants
Healthcare scheduling workflows
Production deployment

The central design principle is to keep critical business invariants at the backend and database boundaries, rather than relying on client-side checks.

👩‍💻 Project

Hospital Management System (HMS)

Built as a production-oriented full-stack healthcare operations platform with a focus on reliable scheduling, secure data handling, AI-assisted workflows, and resilient integrations.

🔗 Links
Live Application: https://hospital-management-system-v2-ashy.vercel.app/
GitHub Repository: https://github.com/Ziggyyyyyyyy/hospital-management-system-v2
API Documentation: docs/API.md
Database Documentation: docs/DATABASE.md
Google Calendar Setup: docs/GOOGLE_CALENDAR_SETUP.md
LLM Prompts: docs/LLM_PROMPTS.md
System Design: docs/SYSTEM_DESIGN.md
