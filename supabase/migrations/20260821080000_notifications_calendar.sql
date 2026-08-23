-- ============================================================
-- PHASE 4 — NOTIFICATIONS + GOOGLE CALENDAR INTEGRATION
-- Timestamp: 20260821080000
-- Scope:
--   • notifications (email/app/push with status + retries)
--   • calendar_events (Google Calendar event IDs + sync status)
--   • user_oauth_tokens (encrypted, server-side only)
--   • RLS + triggers
-- ============================================================

BEGIN;

-- ============================================================
-- 1. NOTIFICATIONS — generic delivery log
-- ============================================================
CREATE TABLE IF NOT EXISTS public.notifications (
  notification_id   BIGSERIAL PRIMARY KEY,
  user_id           UUID      REFERENCES auth.users(id) ON DELETE SET NULL,
  patient_id        BIGINT    REFERENCES public.patients(patient_id) ON DELETE SET NULL,
  staff_id          BIGINT    REFERENCES public.medical_staff(staff_id) ON DELETE SET NULL,

  appointment_id    BIGINT    REFERENCES public.appointments(appointment_id) ON DELETE SET NULL,
  reminder_id       BIGINT    REFERENCES public.medication_reminders(reminder_id) ON DELETE SET NULL,

  type              TEXT      NOT NULL
    CHECK (type IN (
      'BOOKING_CONFIRMATION',
      'APPOINTMENT_REMINDER',
      'APPOINTMENT_CANCELLATION',
      'APPOINTMENT_RESCHEDULE',
      'DOCTOR_LEAVE_CONFLICT',
      'MEDICATION_REMINDER',
      'PREVISIT_SUMMARY_READY',
      'POSTVISIT_SUMMARY_READY',
      'SYSTEM_ADMIN'
    )),

  channel           TEXT      NOT NULL
    CHECK (channel IN ('EMAIL','SMS','PUSH','IN_APP')),

  status            TEXT      NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING','QUEUED','SENDING','SENT','DELIVERED','FAILED','CANCELLED')),

  recipient         TEXT      NOT NULL,   -- email / phone / device token
  subject           TEXT,
  body              TEXT,
  template_name     TEXT,
  template_vars     JSONB,

  provider          TEXT,      -- e.g. 'resend','sendgrid','twilio','firebase'
  provider_message_id TEXT,

  retry_count       INTEGER   NOT NULL DEFAULT 0,
  max_retries       INTEGER   NOT NULL DEFAULT 3,
  last_error        TEXT,
  failed_at         TIMESTAMPTZ,
  sent_at           TIMESTAMPTZ,
  delivered_at      TIMESTAMPTZ,

  scheduled_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS notifications_user_idx
  ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS notifications_patient_idx
  ON public.notifications(patient_id);
CREATE INDEX IF NOT EXISTS notifications_appt_idx
  ON public.notifications(appointment_id);
CREATE INDEX IF NOT EXISTS notifications_status_scheduled_idx
  ON public.notifications(status, scheduled_at);
CREATE INDEX IF NOT EXISTS notifications_type_idx
  ON public.notifications(type);
CREATE INDEX IF NOT EXISTS notifications_created_idx
  ON public.notifications(created_at DESC);

-- ============================================================
-- 2. CALENDAR EVENTS — Google Calendar sync state
-- ============================================================
CREATE TABLE IF NOT EXISTS public.calendar_events (
  event_id          BIGSERIAL PRIMARY KEY,
  appointment_id    BIGINT    NOT NULL REFERENCES public.appointments(appointment_id) ON DELETE CASCADE,

  google_event_id   TEXT,      -- event id from Google Calendar
  patient_email     TEXT,
  doctor_email      TEXT,

  patient_status    TEXT      NOT NULL DEFAULT 'PENDING'
    CHECK (patient_status IN ('PENDING','SYNCING','SYNCED','FAILED','CANCELLED','UPDATED')),
  doctor_status     TEXT      NOT NULL DEFAULT 'PENDING'
    CHECK (doctor_status IN ('PENDING','SYNCING','SYNCED','FAILED','CANCELLED','UPDATED')),

  patient_error     TEXT,
  doctor_error      TEXT,
  last_sync_at      TIMESTAMPTZ,
  sync_attempts     INTEGER   NOT NULL DEFAULT 0,

  summary           TEXT,
  description       TEXT,
  start_time        TIMESTAMPTZ NOT NULL,
  end_time          TIMESTAMPTZ NOT NULL,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT calendar_events_one_per_appt UNIQUE (appointment_id)
);

CREATE INDEX IF NOT EXISTS calendar_events_appt_idx
  ON public.calendar_events(appointment_id);
CREATE INDEX IF NOT EXISTS calendar_events_google_idx
  ON public.calendar_events(google_event_id);
CREATE INDEX IF NOT EXISTS calendar_events_status_idx
  ON public.calendar_events(patient_status, doctor_status);

-- ============================================================
-- 3. USER OAUTH TOKENS — server-side only, never exposed client-side
--    NOTE: Tokens should be encrypted at application layer before insert.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.user_oauth_tokens (
  token_id          BIGSERIAL PRIMARY KEY,
  user_id           UUID      NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  provider          TEXT      NOT NULL CHECK (provider IN ('google_calendar')),
  scope             TEXT      NOT NULL,

  access_token_cipher  TEXT   NOT NULL,   -- encrypted
  refresh_token_cipher TEXT   NOT NULL,   -- encrypted
  token_type          TEXT   DEFAULT 'Bearer',
  expires_at          TIMESTAMPTZ,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT oauth_one_per_user_provider UNIQUE (user_id, provider)
);

-- NO RLS BY DEFAULT: MUST BE ACCESSED ONLY BY SERVICE ROLE.
-- Access control enforced entirely in application layer.
-- We do NOT enable RLS on this table because we intentionally
-- restrict it to the service role (bypasses RLS) ONLY.

-- ============================================================
-- 4. RLS
-- ============================================================
ALTER TABLE public.notifications      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendar_events    ENABLE ROW LEVEL SECURITY;

-- ------- notifications -------
CREATE POLICY notifications_self_read
  ON public.notifications FOR SELECT
  USING (
    (user_id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.patients p
       WHERE p.patient_id = notifications.patient_id AND p.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.medical_staff ms
       WHERE ms.user_id = auth.uid()
         AND (ms.staff_type = 'Admin'
              OR (ms.staff_id = notifications.staff_id))
    )
  );

-- Admin can read all, write all notifications via service role.
-- Patients/Staff read only.

CREATE POLICY notifications_admin_write
  ON public.notifications FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.medical_staff ms
       WHERE ms.user_id = auth.uid() AND ms.staff_type = 'Admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.medical_staff ms
       WHERE ms.user_id = auth.uid() AND ms.staff_type = 'Admin'
    )
  );

-- ------- calendar_events -------
CREATE POLICY calendar_events_read
  ON public.calendar_events FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.appointments a
      JOIN public.patients p ON p.patient_id = a.patient_id
       WHERE a.appointment_id = calendar_events.appointment_id
         AND p.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.appointments a
      JOIN public.medical_staff ms ON ms.staff_id = a.doctor_id
       WHERE a.appointment_id = calendar_events.appointment_id
         AND ms.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.medical_staff ms
       WHERE ms.user_id = auth.uid() AND ms.staff_type = 'Admin'
    )
  );

-- Calendar writes are server-side / service-role only.

-- ============================================================
-- 5. TRIGGERS — updated_at
-- ============================================================
DROP TRIGGER IF EXISTS notifications_updated_at      ON public.notifications;
CREATE TRIGGER notifications_updated_at
  BEFORE UPDATE ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS calendar_events_updated_at    ON public.calendar_events;
CREATE TRIGGER calendar_events_updated_at
  BEFORE UPDATE ON public.calendar_events
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS user_oauth_tokens_updated_at  ON public.user_oauth_tokens;
CREATE TRIGGER user_oauth_tokens_updated_at
  BEFORE UPDATE ON public.user_oauth_tokens
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMIT;
