-- ============================================================
-- PHASE 3 — POST-VISIT AI + MEDICATION REMINDERS
-- Timestamp: 20260821070000
-- Scope:
--   • post_visit_notes (doctor input)
--   • post_visit_summaries (AI-generated patient summary)
--   • prescriptions (structured prescriptions)
--   • prescription_items (individual meds with frequency)
--   • medication_reminders (generated from prescriptions)
--   • RLS + triggers
-- ============================================================

BEGIN;

-- ============================================================
-- 1. POST-VISIT NOTES (doctor-authored authoritative notes)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.post_visit_notes (
  note_id           BIGSERIAL PRIMARY KEY,
  appointment_id    BIGINT    NOT NULL REFERENCES public.appointments(appointment_id) ON DELETE CASCADE,
  patient_id        BIGINT    NOT NULL REFERENCES public.patients(patient_id) ON DELETE CASCADE,
  doctor_id         BIGINT    NOT NULL REFERENCES public.medical_staff(staff_id) ON DELETE CASCADE,
  clinical_notes    TEXT      NOT NULL,
  diagnosis         TEXT,
  follow_up_instr   TEXT,
  created_by        UUID      REFERENCES auth.users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT post_visit_one_per_appt UNIQUE (appointment_id)
);

CREATE INDEX IF NOT EXISTS post_visit_notes_patient_idx
  ON public.post_visit_notes(patient_id);
CREATE INDEX IF NOT EXISTS post_visit_notes_doctor_idx
  ON public.post_visit_notes(doctor_id);
CREATE INDEX IF NOT EXISTS post_visit_notes_appt_idx
  ON public.post_visit_notes(appointment_id);

-- ============================================================
-- 2. POST-VISIT AI SUMMARIES (patient-friendly output)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.post_visit_summaries (
  summary_id        BIGSERIAL PRIMARY KEY,
  appointment_id    BIGINT    NOT NULL REFERENCES public.appointments(appointment_id) ON DELETE CASCADE,
  patient_id        BIGINT    NOT NULL REFERENCES public.patients(patient_id) ON DELETE CASCADE,
  doctor_id         BIGINT    NOT NULL REFERENCES public.medical_staff(staff_id) ON DELETE CASCADE,
  note_id           BIGINT    REFERENCES public.post_visit_notes(note_id) ON DELETE SET NULL,

  visit_explanation TEXT      NOT NULL DEFAULT '',
  medication_sched  TEXT      NOT NULL DEFAULT '',
  follow_up_steps   TEXT      NOT NULL DEFAULT '',
  instructions      TEXT      NOT NULL DEFAULT '',

  model             TEXT,
  prompt_version    TEXT,
  status            TEXT      NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING','PROCESSING','COMPLETED','FAILED')),

  raw_response      JSONB,
  error_message     TEXT,
  generated_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT post_visit_summary_one_per_appt UNIQUE (appointment_id)
);

CREATE INDEX IF NOT EXISTS post_visit_summaries_patient_idx
  ON public.post_visit_summaries(patient_id);
CREATE INDEX IF NOT EXISTS post_visit_summaries_doctor_idx
  ON public.post_visit_summaries(doctor_id);
CREATE INDEX IF NOT EXISTS post_visit_summaries_status_idx
  ON public.post_visit_summaries(status);

-- ============================================================
-- 3. PRESCRIPTIONS (structured prescription header)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.prescriptions (
  prescription_id   BIGSERIAL PRIMARY KEY,
  appointment_id    BIGINT    REFERENCES public.appointments(appointment_id) ON DELETE SET NULL,
  patient_id        BIGINT    NOT NULL REFERENCES public.patients(patient_id) ON DELETE CASCADE,
  doctor_id         BIGINT    NOT NULL REFERENCES public.medical_staff(staff_id) ON DELETE CASCADE,
  record_id         BIGINT    REFERENCES public.medical_records(record_id) ON DELETE SET NULL,

  issue_date        DATE      NOT NULL DEFAULT CURRENT_DATE,
  expiry_date       DATE,
  notes             TEXT,
  status            TEXT      NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE','DISPENSED','EXPIRED','CANCELLED')),

  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS prescriptions_patient_idx
  ON public.prescriptions(patient_id);
CREATE INDEX IF NOT EXISTS prescriptions_doctor_idx
  ON public.prescriptions(doctor_id);
CREATE INDEX IF NOT EXISTS prescriptions_status_idx
  ON public.prescriptions(status);
CREATE INDEX IF NOT EXISTS prescriptions_appt_idx
  ON public.prescriptions(appointment_id);

-- ============================================================
-- 4. PRESCRIPTION ITEMS (individual medicines with schedules)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.prescription_items (
  item_id           BIGSERIAL PRIMARY KEY,
  prescription_id   BIGINT    NOT NULL REFERENCES public.prescriptions(prescription_id) ON DELETE CASCADE,
  medicine_id       BIGINT    REFERENCES public.medicine_stock(medicine_id) ON DELETE SET NULL,
  medicine_name     TEXT      NOT NULL,

  dosage            TEXT      NOT NULL,
  frequency         TEXT      NOT NULL
    CHECK (frequency IN (
      'ONCE_DAILY','TWICE_DAILY','THRICE_DAILY','FOUR_TIMES_DAILY',
      'EVERY_6_HOURS','EVERY_8_HOURS','EVERY_12_HOURS',
      'AS_NEEDED','BEFORE_MEALS','AFTER_MEALS','WITH_MEALS','BEDTIME'
    )),
  duration_days     INTEGER,
  quantity          INTEGER   NOT NULL DEFAULT 0,
  instructions      TEXT,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT prescription_items_qty_nonneg CHECK (quantity >= 0)
);

CREATE INDEX IF NOT EXISTS prescription_items_prescription_idx
  ON public.prescription_items(prescription_id);
CREATE INDEX IF NOT EXISTS prescription_items_medicine_idx
  ON public.prescription_items(medicine_id);

-- ============================================================
-- 5. MEDICATION REMINDERS (generated from prescription_items)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.medication_reminders (
  reminder_id       BIGSERIAL PRIMARY KEY,
  patient_id        BIGINT    NOT NULL REFERENCES public.patients(patient_id) ON DELETE CASCADE,
  prescription_item_id BIGINT NOT NULL REFERENCES public.prescription_items(item_id) ON DELETE CASCADE,

  medicine_name     TEXT      NOT NULL,
  dosage            TEXT      NOT NULL,
  scheduled_at      TIMESTAMPTZ NOT NULL,

  status            TEXT      NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING','SENT','DELIVERED','FAILED','READ','SKIPPED')),

  sent_at           TIMESTAMPTZ,
  retry_count       INTEGER   NOT NULL DEFAULT 0,
  last_error        TEXT,
  notification_id   BIGINT,   -- FK to notifications table (added later)

  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS medication_reminders_patient_idx
  ON public.medication_reminders(patient_id);
CREATE INDEX IF NOT EXISTS medication_reminders_scheduled_idx
  ON public.medication_reminders(scheduled_at, status);
CREATE INDEX IF NOT EXISTS medication_reminders_status_idx
  ON public.medication_reminders(status);

-- Prevent duplicate reminders for same (patient, item, scheduled_at)
CREATE UNIQUE INDEX IF NOT EXISTS medication_reminders_unique_per_schedule
  ON public.medication_reminders(patient_id, prescription_item_id, scheduled_at);

-- ============================================================
-- 6. RLS
-- ============================================================
ALTER TABLE public.post_visit_notes       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_visit_summaries   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prescriptions          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prescription_items     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medication_reminders   ENABLE ROW LEVEL SECURITY;

-- ------- post_visit_notes -------
CREATE POLICY post_visit_notes_patient_read
  ON public.post_visit_notes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.patients p
       WHERE p.patient_id = post_visit_notes.patient_id AND p.user_id = auth.uid()
    )
  );

CREATE POLICY post_visit_notes_doctor_write
  ON public.post_visit_notes FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.medical_staff ms
       WHERE ms.user_id = auth.uid()
         AND (ms.staff_type = 'Admin' OR (ms.staff_type = 'Doctor' AND ms.staff_id = post_visit_notes.doctor_id))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.medical_staff ms
       WHERE ms.user_id = auth.uid()
         AND (ms.staff_type = 'Admin' OR (ms.staff_type = 'Doctor' AND ms.staff_id = post_visit_notes.doctor_id))
    )
  );

-- ------- post_visit_summaries -------
CREATE POLICY post_visit_summaries_patient_read
  ON public.post_visit_summaries FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.patients p
       WHERE p.patient_id = post_visit_summaries.patient_id AND p.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.medical_staff ms
       WHERE ms.user_id = auth.uid()
         AND (ms.staff_type = 'Admin' OR (ms.staff_type = 'Doctor' AND ms.staff_id = post_visit_summaries.doctor_id))
    )
  );

-- Summaries are written server-side via service role only.
-- RLS allows SELECT only (service bypasses RLS for writes).

-- ------- prescriptions -------
CREATE POLICY prescriptions_patient_read
  ON public.prescriptions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.patients p
       WHERE p.patient_id = prescriptions.patient_id AND p.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.medical_staff ms
       WHERE ms.user_id = auth.uid()
         AND ms.staff_type IN ('Admin','Doctor','Pharmacist','Nurse')
    )
  );

CREATE POLICY prescriptions_doctor_write
  ON public.prescriptions FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.medical_staff ms
       WHERE ms.user_id = auth.uid()
         AND (ms.staff_type = 'Admin' OR (ms.staff_type = 'Doctor' AND ms.staff_id = prescriptions.doctor_id))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.medical_staff ms
       WHERE ms.user_id = auth.uid()
         AND (ms.staff_type = 'Admin' OR (ms.staff_type = 'Doctor' AND ms.staff_id = prescriptions.doctor_id))
    )
  );

-- ------- prescription_items -------
CREATE POLICY prescription_items_read
  ON public.prescription_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.prescriptions pr
      JOIN public.patients p ON p.patient_id = pr.patient_id
       WHERE pr.prescription_id = prescription_items.prescription_id
         AND p.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.medical_staff ms
       WHERE ms.user_id = auth.uid()
         AND ms.staff_type IN ('Admin','Doctor','Pharmacist','Nurse')
    )
  );

CREATE POLICY prescription_items_write
  ON public.prescription_items FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.medical_staff ms
       WHERE ms.user_id = auth.uid()
         AND (ms.staff_type = 'Admin' OR ms.staff_type = 'Doctor')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.medical_staff ms
       WHERE ms.user_id = auth.uid()
         AND (ms.staff_type = 'Admin' OR ms.staff_type = 'Doctor')
    )
  );

-- ------- medication_reminders -------
CREATE POLICY medication_reminders_patient_read
  ON public.medication_reminders FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.patients p
       WHERE p.patient_id = medication_reminders.patient_id AND p.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.medical_staff ms
       WHERE ms.user_id = auth.uid()
         AND ms.staff_type IN ('Admin','Doctor','Nurse')
    )
  );

-- Reminders written server-side via service role (scheduler).
-- Patients/Staff read-only through RLS above.

-- ============================================================
-- 7. TRIGGERS — updated_at
-- ============================================================
DROP TRIGGER IF EXISTS post_visit_notes_updated_at        ON public.post_visit_notes;
CREATE TRIGGER post_visit_notes_updated_at
  BEFORE UPDATE ON public.post_visit_notes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS post_visit_summaries_updated_at    ON public.post_visit_summaries;
CREATE TRIGGER post_visit_summaries_updated_at
  BEFORE UPDATE ON public.post_visit_summaries
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS prescriptions_updated_at           ON public.prescriptions;
CREATE TRIGGER prescriptions_updated_at
  BEFORE UPDATE ON public.prescriptions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS prescription_items_updated_at      ON public.prescription_items;
CREATE TRIGGER prescription_items_updated_at
  BEFORE UPDATE ON public.prescription_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS medication_reminders_updated_at    ON public.medication_reminders;
CREATE TRIGGER medication_reminders_updated_at
  BEFORE UPDATE ON public.medication_reminders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMIT;
