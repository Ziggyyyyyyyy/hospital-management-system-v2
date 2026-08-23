# 🏥 Hospital Management System

<p align="center">
  <strong>A modern, secure, role-based healthcare operations platform</strong>
</p>

<p align="center">
  Manage patients, appointments, clinical workflows, pharmacy inventory, billing, analytics and AI-assisted documentation from one centralized system.
</p>

<p align="center">

![Next.js](https://img.shields.io/badge/Next.js-15-black?logo=next.js)
![React](https://img.shields.io/badge/React-18-61DAFB?logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-v4-06B6D4?logo=tailwindcss)
![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-3ECF8E?logo=supabase)
![Vitest](https://img.shields.io/badge/Testing-Vitest-6E9F18?logo=vitest)

</p>

---

## 📌 Overview

The **Hospital Management System (HMS)** is a full-stack healthcare operations platform designed to centralize and streamline day-to-day hospital workflows.

The system provides dedicated workspaces for:

- 👨‍⚕️ Doctors
- 👩‍⚕️ Nurses
- 🧑‍🤝‍🧑 Patients
- 💊 Pharmacists
- 🛡️ Administrators

Instead of treating appointments, patient information, pharmacy, billing, clinical documentation and hospital analytics as isolated modules, HMS connects them through a common role-aware platform.

The application combines traditional hospital management workflows with modern capabilities such as:

- End-to-end appointment booking
- Temporary appointment-slot holding
- Availability and leave management
- AI-assisted pre-visit symptom intake
- AI-generated clinical summaries
- Post-visit documentation
- Pharmacy inventory management
- Billing and invoice management
- Hospital analytics
- Notifications and reminders
- Calendar integration
- Role-based access control
- Responsive light/dark UI

---

# ✨ Key Features

| Feature | Description |
|---|---|
| 🔐 Authentication | Supabase-based authentication and protected sessions |
| 👥 RBAC | Role-aware access for Admin, Doctor, Nurse, Patient and Pharmacist |
| 📅 Appointments | Specialty → Doctor → Date → Slot → Hold → Confirm workflow |
| ⏱️ Slot Holding | Server-enforced temporary slot reservation with countdown |
| 👨‍⚕️ Doctor Management | Availability, leave, conflicts and appointment workflows |
| 🧑‍🤝‍🧑 Patient Management | Patient profiles, appointments and billing |
| 💊 Pharmacy | Inventory, low-stock/out-of-stock tracking and dispensing |
| 💳 Billing | Invoices, billing items and payment status |
| 🤖 AI Pre-Visit | Structured symptom intake and AI-generated visit preparation |
| 📝 Clinical Notes | Post-visit documentation workflows |
| 📊 Analytics | Revenue, visits, demographics and medicine/billing analytics |
| 🔔 Notifications | Notification and retry infrastructure |
| 📆 Calendar | Calendar authorization and synchronization support |
| 🌙 Theming | Responsive clinical UI with light/dark themes |
| 🧪 Testing | Vitest-based feature and state tests |

---

# 👥 Role-Based Workspaces

## 👨‍⚕️ Doctor Workspace

The Doctor dashboard provides a focused clinical workspace for managing daily patient interactions.

### Capabilities

- View appointments
- View patient information
- Manage admissions
- View available rooms
- View medicine stock
- Create post-visit notes
- Manage prescriptions
- Manage availability
- Manage doctor leave
- Detect scheduling conflicts
- Access AI-assisted documentation

### Doctor Workflow

```text
Appointments
      ↓
Patient Information
      ↓
Consultation
      ↓
Prescription / Clinical Notes
      ↓
Post-Visit Documentation
```

---

# 👩‍⚕️ Nurse Workspace

The Nurse dashboard focuses on patient assignment and daily care operations.

### Capabilities

- View assigned patients
- View room assignments
- Track nurse assignments
- Access relevant patient information
- Monitor daily workload

### Workflow

```text
Nurse
 ↓
Assigned Patients
 ↓
Room / Assignment Information
 ↓
Patient Care Workflow
```

---

# 🧑‍🤝‍🧑 Patient Workspace

Patients get a personalized dashboard for managing their healthcare journey.

### Capabilities

- View personal profile
- View upcoming appointments
- Book appointments
- Select medical specialty
- Select doctor
- Browse available slots
- Temporarily hold appointment slots
- Confirm appointments
- View billing information
- Submit pre-visit symptoms
- View AI-generated pre-visit summary
- View suggested questions for the doctor

---

# 💊 Pharmacy Workspace

The Pharmacy dashboard provides inventory-focused operations.

### Capabilities

- View medicine inventory
- Monitor stock levels
- Identify low-stock medicines
- Identify out-of-stock medicines
- Dispense medicines
- Restock medicines
- View inventory statistics

### Inventory Workflow

```text
Medicine Inventory
       ↓
Stock Classification
       ↓
In Stock / Low Stock / Out of Stock
       ↓
Dispense / Restock
```

---

# 🛡️ Administrator Workspace

The Admin workspace provides centralized hospital operations management.

### Management

- Staff management
- Patient management
- Nurse assignment
- Billing management
- Billing item management
- Appointment management

### Analytics

- Revenue by department
- Visits by department
- Gender distribution
- Blood-type distribution
- Billing item analytics
- Medicine quantity analytics
- Operational statistics

---

# 📅 Appointment Booking System

One of the core workflows of HMS is the complete appointment booking pipeline.

## End-to-End Flow

```text
┌──────────────────┐
│ Select Specialty │
└────────┬─────────┘
         ↓
┌──────────────────┐
│  Select Doctor   │
└────────┬─────────┘
         ↓
┌──────────────────┐
│ Select Date      │
└────────┬─────────┘
         ↓
┌──────────────────┐
│ Available Slots  │
└────────┬─────────┘
         ↓
┌──────────────────┐
│ Hold Appointment │
└────────┬─────────┘
         ↓
┌──────────────────┐
│ Hold Countdown   │
│    5 Minutes     │
└────────┬─────────┘
         ↓
┌──────────────────┐
│ Confirm Booking  │
└──────────────────┘
```

## Appointment Features

- Specialty selection
- Doctor filtering
- Doctor availability
- Slot generation
- Temporary slot holds
- Server-enforced hold expiration
- Booking confirmation
- Idempotency protection
- Appointment cancellation
- Appointment rescheduling
- Doctor leave management
- Conflict detection
- Appointment state management

---

# 🤖 AI-Powered Pre-Visit Intelligence

HMS includes an AI-assisted patient intake workflow designed to help structure information before a clinical consultation.

## Workflow

```text
Patient
   ↓
Select Existing Appointment
   ↓
Enter Symptoms
   ↓
Severity
   ↓
Duration
   ↓
Worsening / Context
   ↓
AI Consent
   ↓
AI Processing
   ↓
Pre-Visit Summary
   ↓
Suggested Questions
```

The patient can provide structured information including:

- Symptoms
- Severity
- Duration
- Whether symptoms are worsening
- Additional context
- Consent for AI processing

The AI summary can provide:

- Chief complaint
- Urgency information
- Structured summary
- Suggested questions for the doctor

### AI Lifecycle

```text
PENDING
   ↓
PROCESSING
   ↓
COMPLETED
   ↓
AI Summary Available
```

Failure states are also represented and can be refreshed from the patient dashboard.

> **Medical Safety:** AI-generated content is intended only as decision-support and must not be treated as a diagnosis or replacement for professional medical judgment.

---

# 📝 Post-Visit Clinical Documentation

The system also supports post-visit documentation workflows.

Doctors can record relevant information following an appointment, while the application provides supporting AI infrastructure for post-visit documentation.

```text
Appointment
     ↓
Clinical Consultation
     ↓
Post-Visit Notes
     ↓
AI-Assisted Documentation
     ↓
Patient Record
```

---

# 💳 Billing & Invoicing

The billing module provides centralized invoice and billing-item management.

### Features

- Create billing records
- Update billing records
- Add billing items
- Track invoice status
- View invoice amounts
- Patient billing summary
- Expandable invoice details
- Admin billing table
- Semantic payment status indicators

Supported visual states include:

```text
PAID
PENDING
NEUTRAL / OTHER
```

---

# 💊 Pharmacy & Medicine Management

The pharmacy module manages medicine availability and dispensing workflows.

### Stock Categories

```text
┌───────────────┐
│ In Stock      │
├───────────────┤
│ Low Stock     │
├───────────────┤
│ Out of Stock  │
├───────────────┤
│ All Medicines │
└───────────────┘
```

The dashboard provides KPI cards and category counts for quick inventory visibility.

---

# 📊 Hospital Analytics

Administrators can access operational analytics through a dedicated dashboard.

### Analytics Available

- Revenue trends
- Department visit trends
- Gender distribution
- Blood-type distribution
- Billing item distribution
- Medicine quantity information
- Overall operational statistics

Analytics are rendered through responsive chart components.

---

# 🔔 Notifications

The application includes a notification infrastructure for hospital workflows.

Supported functionality includes:

- Notification retrieval
- Notification retry handling
- Notification service layer
- Reminder-related workflows
- Appointment-related notifications

---

# 📆 Calendar Integration

HMS includes calendar integration infrastructure for appointment-related workflows.

The calendar module supports:

- Authorization
- OAuth callback handling
- Appointment synchronization

---

# 🔐 Security Architecture

Security is treated as a first-class concern throughout the application.

## Authentication

Supabase Authentication provides the identity layer.

```text
User
 ↓
Supabase Authentication
 ↓
Authenticated Session
 ↓
Role Resolution
 ↓
Role-Specific Workspace
```

## Role-Based Authorization

The system supports:

```text
Admin
Doctor
Nurse
Patient
Pharmacist
```

Protected API routes validate authentication and apply role/ownership checks before performing sensitive operations.

## Sensitive Server Operations

Where recursive database policies can interfere with controlled server-side reads, the application uses a service client **only after application-level identity and authorization checks**.

This keeps service-level database access behind the existing authorization boundary instead of exposing protected endpoints publicly.

---

# 🏗️ System Architecture

```text
                         ┌──────────────────────┐
                         │       Client         │
                         │ React / Next.js UI   │
                         └──────────┬───────────┘
                                    │
                                    ▼
                         ┌──────────────────────┐
                         │    Role-Based Shell  │
                         │ Admin / Doctor /     │
                         │ Nurse / Patient /    │
                         │ Pharmacist           │
                         └──────────┬───────────┘
                                    │
                                    ▼
                    ┌───────────────────────────────┐
                    │      Next.js API Routes       │
                    │                               │
                    │ Appointments                  │
                    │ Patients                      │
                    │ Staff                         │
                    │ Billing                       │
                    │ Pharmacy                      │
                    │ AI                            │
                    │ Notifications                 │
                    │ Calendar                      │
                    │ Analytics                     │
                    └───────────────┬───────────────┘
                                    │
                                    ▼
                    ┌───────────────────────────────┐
                    │       Domain Services         │
                    │                               │
                    │ Booking Service                │
                    │ Availability Service           │
                    │ Slot Generator                 │
                    │ Hold Service                   │
                    │ Leave Service                  │
                    │ AI Services                    │
                    │ Notification Service           │
                    │ Medication Services            │
                    │ Calendar Service               │
                    └───────────────┬───────────────┘
                                    │
                                    ▼
                    ┌───────────────────────────────┐
                    │           Supabase            │
                    │                               │
                    │ Authentication                │
                    │ PostgreSQL                    │
                    │ Row Level Security             │
                    │ Database Functions             │
                    └───────────────────────────────┘
```

---

# 🧩 Application Architecture

The codebase is organized into clear feature and domain boundaries.

```text
hospital-management-system/
│
├── app/
│   ├── admin/
│   ├── doctor/
│   ├── nurse/
│   ├── patient/
│   ├── pharmacy/
│   │
│   └── api/
│       ├── admin/
│       ├── ai/
│       ├── appointments/
│       ├── billing/
│       ├── calendar/
│       ├── dashboard/
│       ├── doctor-leave/
│       ├── doctors/
│       ├── notifications/
│       ├── patients/
│       ├── post-visit-notes/
│       ├── prescriptions/
│       ├── specialties/
│       └── symptoms/
│
├── components/
│   ├── admin/
│   ├── appointments/
│   ├── doctor/
│   ├── leave/
│   ├── patient/
│   ├── shell/
│   ├── symptoms/
│   └── ui/
│
├── lib/
│   ├── ai/
│   ├── appointments/
│   ├── calendar/
│   ├── medications/
│   ├── notifications/
│   └── validation/
│
├── supabase/
│   └── migrations/
│
├── tests/
│
├── utils/
│   └── supabase/
│
├── package.json
└── README.md
```

---

# 🛠️ Technology Stack

## Frontend

- **Next.js**
- **React**
- **TypeScript**
- **Tailwind CSS v4**
- **shadcn/ui**
- **Radix UI**
- **Lucide React**
- **Recharts**
- **Sonner**
- **next-themes**

## Backend

- **Next.js App Router**
- **Next.js API Routes**
- **TypeScript**
- **Supabase**
- **PostgreSQL**

## Authentication & Security

- **Supabase Auth**
- **Role-Based Access Control**
- **PostgreSQL Row Level Security**
- **Server-side Supabase service client**

## AI

- **Google Gemini API**

## Testing & Quality

- **Vitest**
- **TypeScript**
- **ESLint**

---

# 🎨 Design System

The UI was designed around a clinical, calm and information-dense visual language.

### Design Principles

- Semantic color tokens
- Consistent typography
- Accessible controls
- Responsive layouts
- Clear hierarchy
- Meaningful status indicators
- Skeleton loading states
- Empty states
- Error states
- Consistent cards and tables
- Light and dark themes

### UI System

The application uses reusable components built with:

- shadcn/ui
- Radix primitives
- Tailwind CSS
- Lucide icons

The role-based application shell provides:

- Responsive sidebar
- Mobile navigation sheet
- Active route highlighting
- Breadcrumbs
- User profile menu
- Role-aware navigation
- Collapsible desktop navigation

---

# 📱 Responsive Experience

The interface is designed to work across:

- Desktop
- Laptop
- Tablet
- Mobile

Mobile navigation uses a responsive sheet-based navigation pattern while desktop users get a collapsible sidebar.

---

# 🧪 Testing & Code Quality

The project contains automated tests for important application domains.

### Test Areas

- Appointment booking
- Appointment state transitions
- AI features
- Notifications
- Calendar workflows

### TypeScript

```bash
npx tsc --noEmit
```

### ESLint

```bash
npm run lint
```

### Tests

```bash
npm test
```

---

# 🚀 Getting Started

## Prerequisites

Install:

- Node.js 18+
- npm
- Git
- Supabase project
- Gemini API access for AI features

---

## 1. Clone the Repository

```bash
git clone https://github.com/Ziggyyyyyyyy/hospital-management-system.git
```

```bash
cd hospital-management-system
```

---

## 2. Install Dependencies

```bash
npm install
```

---

## 3. Environment Variables

Create:

```text
.env.local
```

Configure the required Supabase and AI environment variables based on the project's `.env.example`.

Example:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
GEMINI_API_KEY=your_gemini_api_key
```

### ⚠️ Important

Never commit:

```text
.env.local
```

Never expose:

```text
SUPABASE_SERVICE_ROLE_KEY
GEMINI_API_KEY
```

in client-side code or public repositories.

---

# 🗄️ Database Setup

The project contains Supabase migrations under:

```text
supabase/migrations/
```

The migration set covers areas including:

- Base hospital schema
- Appointment domain
- Appointment RPCs
- AI visit intelligence
- Post-visit reminders
- Notifications
- Calendar integration
- Medication-related functionality

Apply the migrations to the configured Supabase project before using the complete application.

---

# ▶️ Run Locally

Start the development server:

```bash
npm run dev
```

Then open:

```text
http://localhost:3000
```

The exact port may differ depending on the local development configuration.

---

# 🔄 Core Patient Workflow

The complete patient journey can be represented as:

```text
Sign Up / Sign In
       ↓
Patient Dashboard
       ↓
View Healthcare Information
       ↓
Book Appointment
       ↓
Select Specialty
       ↓
Select Doctor
       ↓
Select Slot
       ↓
Hold Slot
       ↓
Confirm Appointment
       ↓
Pre-Visit AI Intake
       ↓
Doctor Consultation
       ↓
Prescription / Clinical Notes
       ↓
Post-Visit Documentation
       ↓
Billing
```

---

# 🔄 Core Hospital Workflow

```text
Patient
   │
   ├── Appointment
   │       ↓
   │    Doctor
   │       ↓
   │    Consultation
   │       ↓
   │    Prescription / Notes
   │
   ├── Billing
   │
   └── Pharmacy
           ↓
        Dispensing

Nurse
   │
   └── Patient Assignment
           ↓
       Room / Care

Admin
   │
   ├── Staff
   ├── Patients
   ├── Billing
   ├── Appointments
   └── Analytics
```

---

# 🔌 API Domains

The backend exposes API routes across multiple healthcare domains.

| Domain | Operations |
|---|---|
| `/api/appointments` | Appointment retrieval and management |
| `/api/appointments/hold` | Temporary appointment hold |
| `/api/appointments/confirm` | Appointment confirmation |
| `/api/appointments/[id]/cancel` | Cancellation |
| `/api/appointments/[id]/reschedule` | Rescheduling |
| `/api/doctors` | Doctor discovery |
| `/api/doctors/[id]/availability` | Doctor availability |
| `/api/doctors/[id]/slots` | Available appointment slots |
| `/api/specialties` | Medical specialties |
| `/api/symptoms` | Patient symptom intake |
| `/api/ai/previsit` | Pre-visit AI summary |
| `/api/ai/postvisit` | Post-visit AI workflows |
| `/api/post-visit-notes` | Clinical documentation |
| `/api/prescriptions` | Prescription workflows |
| `/api/staff` | Staff management |
| `/api/billing` | Billing and invoice management |
| `/api/dashboard/*` | Admin analytics |
| `/api/notifications` | Notifications |
| `/api/calendar` | Calendar integration |
| `/api/doctor-leave` | Leave management |

---

# 📊 Admin Analytics

The analytics layer includes dedicated endpoints for:

```text
Revenue by Department
        ↓
Visits by Department
        ↓
Gender Distribution
        ↓
Blood Type Distribution
        ↓
Billing Item Type
        ↓
Medicine Quantity
```

All protected analytics endpoints apply authentication and administrator authorization before controlled server-side reads.

---

# 🧠 Engineering Highlights

Some of the core engineering decisions in the project include:

### 1. Role-Based Architecture

Instead of a single generic dashboard, each role gets a focused workspace.

### 2. Domain-Oriented Services

Complex appointment functionality is separated into dedicated services such as:

- Booking
- Availability
- Slot generation
- Slot holding
- Leave management
- Conflict handling

### 3. Server-Enforced Slot Holds

Appointment holds are not treated as a purely client-side countdown.

The server controls hold validity, preventing expired client-side timers from becoming valid bookings.

### 4. Idempotent Appointment Confirmation

The booking confirmation flow includes idempotency handling to reduce the risk of duplicate appointment creation when requests are repeated.

### 5. Ownership Checks

Sensitive patient and appointment operations validate the relationship between the authenticated user and requested resources.

### 6. Reusable UI System

Common UI patterns are implemented through reusable components instead of repeatedly rebuilding forms, cards, dialogs, tables and status indicators.

### 7. Semantic Design Tokens

Status colors and UI states are represented through semantic tokens instead of scattered hardcoded colors, improving consistency and dark-mode behavior.

---

# 📈 Project Scope

The current system brings together approximately:

- **5 role-based workspaces**
- **19 integrated service/API modules**
- Appointment management
- Clinical workflows
- Pharmacy inventory
- Billing
- Analytics
- Notifications
- Calendar integration
- AI-assisted documentation

---

# 🔮 Future Enhancements

Potential future improvements include:

- Real-time hospital-wide notifications
- Advanced audit logging
- More detailed analytics
- Enhanced appointment reminders
- Expanded AI decision-support workflows
- Additional healthcare integrations
- Production monitoring and observability
- More extensive accessibility testing
- Advanced reporting and export functionality

---

# ⚠️ Important Disclaimer

This project is an educational/software-engineering implementation of a Hospital Management System.

It is **not a certified medical system** and should not be used as a replacement for professional medical judgment.

AI-generated information is intended for assistance and information organization only. Clinical decisions must always be made by qualified healthcare professionals.

---

# 📸 Screenshots

> Add project screenshots here to showcase the UI.

### Landing Page

```text
Add screenshot here
```

### Patient Dashboard

```text
Add screenshot here
```

### Appointment Booking

```text
Add screenshot here
```

### Doctor Dashboard

```text
Add screenshot here
```

### Pharmacy Dashboard

```text
Add screenshot here
```

### Admin Dashboard & Analytics

```text
Add screenshot here
```

---

# 🎥 Demo

Add your project demonstration video here.

```text
Demo Video:
PASTE_YOUR_LOOM_OR_YOUTUBE_LINK_HERE
```

---

# 📚 Learning & Engineering Goals

This project was built to explore practical full-stack software engineering concepts including:

- Full-stack application architecture
- Role-based authorization
- Secure API design
- Database-backed workflows
- Scheduling systems
- Appointment state management
- Idempotent operations
- AI integration
- Responsive UI architecture
- Reusable component systems
- Automated testing
- Healthcare workflow modeling

---

# ⭐ Why This Project?

Traditional hospital management applications often divide operations across disconnected modules.

HMS focuses on bringing these workflows together:

```text
             ┌───────────────┐
             │    PATIENT    │
             └───────┬───────┘
                     │
        ┌────────────┼────────────┐
        ↓            ↓            ↓
   Appointment    AI Intake     Billing
        │            │            │
        ↓            ↓            ↓
     Doctor       Summary      Invoice
        │
        ↓
   Prescription
        │
        ↓
    Pharmacy
        │
        ↓
    Patient Care
```

The goal is to provide a **single, role-aware, extensible platform** for hospital operations while demonstrating modern software engineering practices.

---

# 👩‍💻 Author

### Aditi Srivastava

**B.Tech — Computer Science & Engineering**  
VIT Bhopal University

GitHub:  
https://github.com/Ziggyyyyyyyy

---

# ⭐ Support

If you find this project useful, consider giving the repository a ⭐ on GitHub.

---

## 📄 License

Add the project's applicable license here if/when a license is formally chosen for the repository.
