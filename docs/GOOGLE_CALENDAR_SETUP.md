# 📆 Hospital Management System (HMS) — Google Calendar Integration & Setup Guide

Comprehensive reference and setup guide for the Google Calendar bi-directional appointment synchronization engine in the Hospital Management System.

---

## 📑 Table of Contents

1. [Integration Overview](#1-integration-overview)
2. [Google Cloud Console Project Setup](#2-google-cloud-console-project-setup)
3. [Enabling the Google Calendar API](#3-enabling-the-google-calendar-api)
4. [OAuth 2.0 Client Configuration](#4-oauth-20-client-configuration)
5. [Environment Variables Reference](#5-environment-variables-reference)
6. [OAuth Authorization & Callback Lifecycle](#6-oauth-authorization--callback-lifecycle)
7. [Cryptographic Token Vault (AES-256-GCM)](#7-cryptographic-token-vault-aes-256-gcm)
8. [Event Lifecycle Operations](#8-event-lifecycle-operations)
9. [Step-by-Step Local End-to-End Testing](#9-step-by-step-local-end-to-end-testing)
10. [Troubleshooting & Common Configuration Errors](#10-troubleshooting--common-configuration-errors)
11. [Security & Privacy Architecture](#11-security--privacy-architecture)

---

## 1. Integration Overview

The HMS Google Calendar integration synchronizes confirmed patient appointments directly with doctor personal and clinical Google Calendars.

- **OAuth 2.0 Delegation:** Doctors authorize the system once via Google's OAuth consent screen.
- **Offline Access:** Obtains long-lived refresh tokens allowing server-side background synchronization without requiring the doctor to remain logged in.
- **Bi-Directional Event Lifecycle:**
  - **Booking Confirmation** $\rightarrow$ Automatically creates a Google Calendar event.
  - **Reschedule** $\rightarrow$ Automatically updates event start/end times.
  - **Cancellation** $\rightarrow$ Automatically removes the event from Google Calendar.
- **Zero-Latency Outbox Pattern:** Calendar synchronization operations run asynchronously in the background (`fireCalendarCreate`, `fireCalendarUpdate`, `fireCalendarDelete`) so clinical booking APIs return immediately.

---

## 2. Google Cloud Console Project Setup

1. Open the [Google Cloud Console](https://console.cloud.google.com/).
2. Click **Select a project** $\rightarrow$ **New Project**.
3. Name your project (e.g., `HMS-Doctor-Calendar`) and click **Create**.
4. Configure the **OAuth Consent Screen**:
   - Go to **APIs & Services** $\rightarrow$ **OAuth consent screen**.
   - User Type: Select **External** (or **Internal** if within a Google Workspace organization).
   - App Name: `Hospital Management System`
   - User Support Email: Select your email address.
   - Developer Contact Information: Enter your email address.
   - Click **Save and Continue**.
5. Add the required scope:
   - Click **Add or Remove Scopes**.
   - Select: `https://www.googleapis.com/auth/calendar` (Manage your calendars).
   - Click **Update** $\rightarrow$ **Save and Continue**.
6. If testing in **External** mode with an unverified app:
   - Add your test doctor Gmail account under **Test users**.

---

## 3. Enabling the Google Calendar API

1. In the Google Cloud Console, navigate to **APIs & Services** $\rightarrow$ **Library**.
2. Search for **Google Calendar API**.
3. Click **Google Calendar API** and select **Enable**.

---

## 4. OAuth 2.0 Client Configuration

1. Go to **APIs & Services** $\rightarrow$ **Credentials**.
2. Click **Create Credentials** $\rightarrow$ **OAuth client ID**.
3. Set **Application type** to **Web application**.
4. Set **Name** to `HMS Web Client`.
5. Under **Authorized JavaScript origins**, add:
   ```text
   http://localhost:3000
   ```
6. Under **Authorized redirect URIs**, add the exact route handler:
   ```text
   http://localhost:3000/api/calendar/callback
   ```
   *(For production deployments, also add `https://your-domain.com/api/calendar/callback`)*
7. Click **Create**.
8. Copy your **Client ID** and **Client Secret**.

---

## 5. Environment Variables Reference

Add the credentials to your local `.env.local` file:

```env
# ------------------------------------------------------------------------------
# Google Calendar & OAuth 2.0 Configuration
# ------------------------------------------------------------------------------
GOOGLE_CLIENT_ID=your-google-oauth-client-id-placeholder
GOOGLE_CLIENT_SECRET=your-google-oauth-client-secret-placeholder
GOOGLE_REDIRECT_URI=http://localhost:3000/api/calendar/callback

# Master encryption key / salt for AES-256-GCM token storage
ENCRYPTION_MASTER_KEY=your-32-byte-master-key-placeholder
ENCRYPTION_SALT=your-random-encryption-salt-placeholder
```

---

## 6. OAuth Authorization & Callback Lifecycle

```text
Doctor Dashboard (/doctor)
       │
       ▼
1. Doctor clicks "Connect Google Calendar"
       │
       ▼
2. GET /api/calendar/authorize
       │
       ├─ Builds Google OAuth consent URL with:
       │  - scope: 'https://www.googleapis.com/auth/calendar'
       │  - access_type: 'offline' (enables refresh token issuance)
       │  - prompt: 'consent' (ensures refresh token is always returned)
       │  - state: signed JSON containing doctor staff_id and user_id
       └─ Redirects Doctor to Google Accounts
       │
       ▼
3. Doctor grants calendar permissions on Google Consent Screen
       │
       ▼
4. Google redirects to GET /api/calendar/callback?code=AUTH_CODE&state=STATE
       │
       ├─ Exchanges authorization code via https://oauth2.googleapis.com/token
       ├─ Extracts access_token, refresh_token, and expires_in
       ├─ Encrypts tokens using AES-256-GCM via `lib/crypto/vault.ts`
       ├─ Stores encrypted credentials in `public.user_oauth_tokens`
       └─ Redirects doctor back to `/doctor?calendar_connected=true`
```

---

## 7. Cryptographic Token Vault (AES-256-GCM)

All access and refresh tokens are encrypted before being written to the database using authenticated AES-256-GCM encryption in [`lib/crypto/vault.ts`](file:///c:/Users/hp/hospital-management-system/lib/crypto/vault.ts):

- **Algorithm:** `aes-256-gcm`
- **Key Derivation:** SHA-256 hash of `ENCRYPTION_MASTER_KEY` / `ENCRYPTION_SALT`
- **Initialization Vector (IV):** 12-byte cryptographically secure random IV generated per encryption
- **Authentication Tag:** 16-byte GCM authentication tag preventing ciphertext tampering
- **Envelope Format:** `v1:<iv_base64>:<tag_base64>:<ciphertext_base64>`

```typescript
// Sample encrypted storage envelope in public.user_oauth_tokens:
"v1:W5k2V1yA7Q==:p9ZbK1v88hM==:8f3kA410Nx9=="
```

---

## 8. Event Lifecycle Operations

All calendar operations are handled through [`lib/calendar/google-calendar-service.ts`](file:///c:/Users/hp/hospital-management-system/lib/calendar/google-calendar-service.ts):

### 1. Booking Confirmation (`fireCalendarCreate`)
- **Trigger:** Triggered when an appointment is confirmed (`outboxBookingConfirmed`).
- **Payload:**
  - **Summary:** `HMS Appointment #${appointment_id} - ${patient_name}`
  - **Description:** Clinical department, reason for visit, and patient contact.
  - **Start / End:** ISO 8601 timestamps formatted in appointment timezone.
  - **Attendees:** Patient email and Doctor email.
  - **Updates:** `sendUpdates=all` (dispatches native Google Calendar email invites).
- **Persistence:** Created `google_event_id` is recorded in `public.calendar_events`.

### 2. Appointment Reschedule (`fireCalendarUpdate`)
- **Trigger:** Triggered when an appointment time is modified (`outboxAppointmentRescheduled`).
- **Action:** Updates Google Calendar event start/end times via `PATCH /primary/events/{google_event_id}`.

### 3. Appointment Cancellation (`fireCalendarDelete`)
- **Trigger:** Triggered when an appointment is cancelled (`outboxAppointmentCancelled`).
- **Action:** Deletes the Google Calendar event via `DELETE /primary/events/{google_event_id}?sendUpdates=all` and cleans `public.calendar_events`.

---

## 9. Step-by-Step Local End-to-End Testing

### Step 1: Start the Development Server
```bash
npm run dev
```

### Step 2: Connect Doctor's Calendar
1. Log in as a Doctor (`/sign-in`).
2. Navigate to the Doctor workspace (`/doctor`).
3. Click **Connect Google Calendar** (or visit `http://localhost:3000/api/calendar/authorize`).
4. Sign in with your test doctor Google Account and click **Allow**.
5. Verify you are redirected back with `calendar_connected=true`.

### Step 3: Book an Appointment
1. Open an incognito window and log in as a Patient.
2. Select the connected Doctor and choose an available slot.
3. Confirm the booking.

### Step 4: Verify Google Calendar Sync
1. Open [Google Calendar](https://calendar.google.com/) for the connected doctor.
2. Confirm the appointment event appears at the scheduled time with the patient's name and visit reason.

---

## 10. Troubleshooting & Common Configuration Errors

| Symptom / Error | Root Cause | Solution |
| :--- | :--- | :--- |
| `redirect_uri_mismatch` (Google Error 400) | The URI in `.env.local` does not match the Google Cloud Console Authorized Redirect URIs. | Add `http://localhost:3000/api/calendar/callback` to **Authorized redirect URIs** in Google Cloud Console. |
| `invalid_grant` during token refresh | Refresh token expired, revoked by user, or Google project set to "Testing" with 7-day token limit. | Re-connect calendar by visiting `/api/calendar/authorize` to generate a fresh refresh token. |
| `Access blocked: HMS has not completed the Google verification process` | App is unverified and user is not in the Test Users list. | Add the doctor's Gmail address to **Test users** under **OAuth consent screen** in Google Cloud Console. |
| Missing refresh token on callback | Google only returns a refresh token on the first authorization unless `prompt=consent` is passed. | The HMS `generateAuthUrl` includes `prompt=consent` and `access_type=offline` by default to ensure refresh tokens are always returned. |

---

## 11. Security & Privacy Architecture

1. **Least Privilege Scopes:** The integration exclusively requests calendar access (`https://www.googleapis.com/auth/calendar`) and does not request Gmail or Google Drive access.
2. **Encrypted at Rest:** Raw OAuth tokens are never stored in plaintext in the database.
3. **Decoupled Outbox Delivery:** Calendar API latency or downtime does not block healthcare workflows or database transaction commits.
4. **Idempotency Protection:** Event synchronization records Google Event IDs to prevent duplicate calendar invitations.
