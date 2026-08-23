# 🏥 Hospital Management System (HMS)

<p align="center">
  <strong>Full-Stack, Role-Based Healthcare Operations & Clinical Scheduling Platform</strong>
</p>

<p align="center">
  A production-oriented hospital management platform for appointment scheduling,
  doctor availability, clinical workflows, AI-assisted documentation,
  pharmacy management, billing, notifications, and Google Calendar integration.
</p>

<p align="center">

![Next.js](https://img.shields.io/badge/Next.js-16.3.2-black?logo=next.js)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-v4-06B6D4?logo=tailwindcss)
![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-3ECF8E?logo=supabase)
![Google Gemini](https://img.shields.io/badge/AI-Google_Gemini-4285F4?logo=google)
![Vitest](https://img.shields.io/badge/Testing-Vitest-6E9F18?logo=vitest)

</p>

---

## 🌐 Live Demo

**Hosted Application:**  
https://hospital-management-system-v2-8xn50z5s9-aditi-collegehub.vercel.app/

**Source Code:**  
https://github.com/Ziggyyyyyyyy/hospital-management-system-v2

> The application is deployed on Vercel and connected to a Supabase PostgreSQL backend.

---

# 📌 1. Project Overview

Traditional hospital workflows are often fragmented across separate systems for
appointments, doctor schedules, patient records, pharmacy inventory, billing,
notifications, and clinical documentation.

The **Hospital Management System (HMS)** provides a unified platform that connects
these workflows through role-based workspaces and transactional backend services.

The system supports five primary roles:

- **Admin** — hospital operations, staff, rooms, billing and analytics
- **Doctor** — schedules, availability, leave, consultations and prescriptions
- **Nurse** — admissions, assigned patients and inpatient monitoring
- **Patient** — doctor discovery, appointment booking, records and billing
- **Pharmacist** — inventory, dispensing and stock management

The platform also integrates AI-assisted pre/post-visit documentation,
Google Calendar synchronization and asynchronous notification processing.

---

# ✨ 2. Key Features

### 🔐 Role-Based Access Control

- Supabase authentication with JWT sessions
- Role-specific dashboards
- API-level authorization
- Resource ownership checks
- PostgreSQL Row Level Security (RLS)

### 📅 Concurrency-Safe Appointment Scheduling

- Dynamic doctor slot generation
- Temporary 5-minute slot holds
- PostgreSQL advisory locks
- Row-level locking using `FOR UPDATE`
- Atomic booking confirmation
- Idempotency protection
- Double-booking prevention

### 👨‍⚕️ Doctor Availability & Leave Management

- Recurring weekly availability
- Working hours and break configuration
- Slot duration configuration
- Doctor leave management
- Automatic conflict detection
- Existing appointment conflict handling
- Patient rescheduling notifications

### 🤖 AI-Assisted Clinical Documentation

**Pre-visit AI:**
- Symptom analysis
- Chief complaint generation
- Urgency classification
- Suggested questions for the doctor

**Post-visit AI:**
- Consultation summarization
- Structured clinical documentation
- Graceful failure and retry handling

Google Gemini is used for AI processing with structured output validation.

### 📬 Reliable Notification System

- Booking confirmations
- Appointment cancellations
- Appointment rescheduling
- Doctor leave conflict notifications
- AI summary notifications
- Notification outbox pattern
- Failure tracking
- Retry processing
- Exponential backoff
- Deduplication support

### 📆 Google Calendar Integration

- OAuth 2.0 authentication
- Calendar event creation
- Appointment rescheduling synchronization
- Event cancellation
- Encrypted OAuth token storage using AES-256-GCM

### 💊 Pharmacy Management

- Medicine inventory
- Stock categorization
- Low-stock monitoring
- Prescription-based dispensing
- Inventory transaction tracking
- Restocking workflows

### 💳 Billing

- Consultation billing
- Medicine billing
- Room billing
- Lab billing
- Multi-item invoices
- Payment status tracking

### 📊 Hospital Analytics

- Revenue by department
- Visit statistics
- Patient demographics
- Blood-group distribution
- Medicine consumption
- Operational dashboard metrics

---

# 🏗️ 3. System Architecture

```text
                    ┌───────────────────────────┐
                    │       Client Layer        │
                    │ Next.js + React + Tailwind│
                    └─────────────┬─────────────┘
                                  │
                                  ▼
                    ┌───────────────────────────┐
                    │   API / Route Handlers    │
                    │ Auth + RBAC + Validation  │
                    └─────────────┬─────────────┘
                                  │
                                  ▼
        ┌──────────────────────────────────────────────────┐
        │                 Domain Services                   │
        │                                                  │
        │ Booking & Holds     Leave & Availability         │
        │ AI Services         Notification Outbox          │
        │ Calendar Service    Billing & Pharmacy           │
        │ Reminder Service    Encryption / Security        │
        └──────────────────────┬───────────────────────────┘
                               │
                               ▼
                    ┌───────────────────────────┐
                    │       Supabase DB         │
                    │ PostgreSQL + RLS + RPCs   │
                    │ Locks + Transactions      │
                    └───────────────────────────┘

External Integrations:
    Google Gemini ── AI processing
    Resend/SMTP  ── Email notifications
    Google Calendar ── Calendar synchronization
