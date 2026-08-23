-- ============================================================
-- PHASE 1 — APPOINTMENT DOMAIN FOUNDATION MIGRATION
-- Timestamp: 20260820180000
-- Scope:
--   • specialties
--   • doctor_specialties
--   • doctor_availability
--   • doctor_leave
--   • appointment_slots
--   • slot_holds
--   • appointments
--   • RLS policies, triggers, constraints, indexes
--   • RPC functions: atomic booking, hold, expiry, leave conflicts
-- ============================================================
-- NOTE: This migration intentionally does NOT drop or alter
-- existing tables (users, patients, medical_staff, departments,
-- medical_records, admissions, billing, rooms, medicine_stock).
-- It only adds the new appointment-domain tables.
-- ============================================================

BEGIN;

-- ============================================================
-- 1. ENUMS
-- ============================================================

DO $$ BEGIN
  CREATE TYPE slot_status AS ENUM ('AVAILABLE','HELD','BOOKED','BLOCKED','EXPIRED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE hold_status AS ENUM ('ACTIVE','CONSUMED','RELEASED','EXPIRED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE appointment_status AS ENUM (
    'HELD',
    'CONFIRMED',
    'COMPLETED',
    'CANCELLED',
    'RESCHEDULE_REQUIRED',
    'DOCTOR_LEAVE_CONFLICT'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE leave_type AS ENUM ('VACATION','SICK','PERSONAL','EMERGENCY','OTHER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE leave_status AS ENUM ('PENDING','APPROVED','DENIED','CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE cancel_reason_type AS ENUM (
    'PATIENT_REQUEST',
    'DOCTOR_UNAVAILABLE',
    'ADMIN_CANCELLED',
    'NO_SHOW',
    'OTHER'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- 2. SPECIALTY LOOKUP
-- ============================================================

CREATE TABLE IF NOT EXISTS public.specialties (
  specialty_id    BIGSERIAL PRIMARY KEY,
  name            TEXT      NOT NULL,
  description     TEXT,
  active          BOOLEAN   NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS specialties_name_unique
  ON public.specialties (name) WHERE active = TRUE;

-- Seed common specialties (safe: idempotent INSERT … ON CONFLICT DO NOTHING)
INSERT INTO public.specialties (name, description) VALUES
  ('General Practice',   'Primary care and general consultations'),
  ('Cardiology',         'Heart and cardiovascular conditions'),
  ('Dermatology',        'Skin, hair, and nail disorders'),
  ('Neurology',          'Nervous system disorders'),
  ('Pediatrics',         'Infant, child, and adolescent care'),
  ('Orthopedics',        'Musculoskeletal system and joints'),
  ('Gynecology',         'Women''s reproductive health'),
  ('Ophthalmology',      'Eye care and vision'),
  ('ENT',                'Ear, nose, and throat'),
  ('Psychiatry',         'Mental health and psychiatric care')
ON CONFLICT (name) WHERE active = TRUE DO NOTHING;

-- ============================================================
-- 3. DOCTOR ↔ SPECIALTIES (many-to-many)
-- ============================================================
-- Reuses medical_staff.staff_id as doctor_id.
-- We only constrain the target to medical_staff rows whose
-- staff_type = 'Doctor' via CHECK + subquery is not allowed,
-- so the enforcement is done in application / triggers.

CREATE TABLE IF NOT EXISTS public.doctor_specialties (
  id             BIGSERIAL PRIMARY KEY,
  doctor_id      BIGINT    NOT NULL,
  specialty_id   BIGINT    NOT NULL REFERENCES public.specialties(specialty_id) ON DELETE CASCADE,
  is_primary     BOOLEAN   NOT NULL DEFAULT FALSE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT doctor_specialties_doctor_fk
    FOREIGN KEY (doctor_id) REFERENCES public.medical_staff(staff_id) ON DELETE CASCADE,
  CONSTRAINT doctor_specialties_unique UNIQUE (doctor_id, specialty_id)
);

CREATE INDEX IF NOT EXISTS doctor_specialties_specialty_idx
  ON public.doctor_specialties (specialty_id);

-- ============================================================
-- 4. DOCTOR AVAILABILITY (recurring working hours pattern)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.doctor_availability (
  id                     BIGSERIAL PRIMARY KEY,
  doctor_id              BIGINT    NOT NULL REFERENCES public.medical_staff(staff_id) ON DELETE CASCADE,
  day_of_week            SMALLINT  NOT NULL CHECK (day_of_week BETWEEN 0 AND 6), -- 0=Sun..6=Sat
  start_time             TIME      NOT NULL,
  end_time               TIME      NOT NULL,
  slot_duration_minutes  SMALLINT  NOT NULL DEFAULT 30 CHECK (slot_duration_minutes > 0 AND slot_duration_minutes <= 480),
  active                 BOOLEAN   NOT NULL DEFAULT TRUE,
  valid_from             DATE,
  valid_until            DATE,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT doctor_availability_time_order CHECK (start_time < end_time)
);

-- Prevent exact duplicate patterns (same doctor, day, start, end, active)
CREATE UNIQUE INDEX IF NOT EXISTS doctor_availability_pattern_unique
  ON public.doctor_availability (doctor_id, day_of_week, start_time, end_time, active)
  WHERE active = TRUE;

CREATE INDEX IF NOT EXISTS doctor_availability_doctor_idx
  ON public.doctor_availability (doctor_id, day_of_week);

-- ============================================================
-- 5. DOCTOR LEAVE
-- ============================================================

CREATE TABLE IF NOT EXISTS public.doctor_leave (
  leave_id      BIGSERIAL PRIMARY KEY,
  doctor_id     BIGINT    NOT NULL REFERENCES public.medical_staff(staff_id) ON DELETE CASCADE,
  start_date    DATE      NOT NULL,
  end_date      DATE      NOT NULL,
  reason        TEXT,
  leave_type    leave_type NOT NULL DEFAULT 'OTHER',
  status        leave_status NOT NULL DEFAULT 'PENDING',
  created_by    UUID REFERENCES auth.users(id), -- admin/staff id from auth.users
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT doctor_leave_date_order CHECK (start_date <= end_date)
);

CREATE INDEX IF NOT EXISTS doctor_leave_doctor_date_idx
  ON public.doctor_leave (doctor_id, start_date, end_date, status);

-- Prevent overlapping APPROVED/PENDING leave periods per doctor
CREATE UNIQUE INDEX IF NOT EXISTS doctor_leave_no_overlap_approved
  ON public.doctor_leave (doctor_id, start_date, end_date)
  WHERE status IN ('PENDING','APPROVED');

-- ============================================================
-- 6. APPOINTMENT SLOTS
-- ============================================================
-- Concrete instantiations of availability for specific dates.

CREATE TABLE IF NOT EXISTS public.appointment_slots (
  slot_id           BIGSERIAL PRIMARY KEY,
  doctor_id         BIGINT      NOT NULL REFERENCES public.medical_staff(staff_id) ON DELETE CASCADE,
  start_time        TIMESTAMPTZ NOT NULL,
  end_time          TIMESTAMPTZ NOT NULL,
  duration_minutes  SMALLINT    NOT NULL CHECK (duration_minutes > 0 AND duration_minutes <= 480),
  status            slot_status NOT NULL DEFAULT 'AVAILABLE',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT appointment_slots_time_order CHECK (start_time < end_time)
);

-- CRITICAL: one doctor cannot have two active slots with the same start_time.
CREATE UNIQUE INDEX IF NOT EXISTS appointment_slots_doctor_start_unique
  ON public.appointment_slots (doctor_id, start_time)
  WHERE status IN ('AVAILABLE','HELD','BOOKED');

CREATE INDEX IF NOT EXISTS appointment_slots_doctor_start_range_idx
  ON public.appointment_slots (doctor_id, start_time, end_time);

CREATE INDEX IF NOT EXISTS appointment_slots_status_start_idx
  ON public.appointment_slots (status, start_time);

CREATE INDEX IF NOT EXISTS appointment_slots_doctor_status_idx
  ON public.appointment_slots (doctor_id, status);

-- ============================================================
-- 7. SLOT HOLDS (temporary reservation)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.slot_holds (
  hold_id       BIGSERIAL PRIMARY KEY,
  slot_id       BIGINT      NOT NULL REFERENCES public.appointment_slots(slot_id) ON DELETE CASCADE,
  patient_id    BIGINT      NOT NULL REFERENCES public.patients(patient_id) ON DELETE CASCADE,
  hold_token    UUID        NOT NULL,
  held_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at    TIMESTAMPTZ NOT NULL,
  status        hold_status NOT NULL DEFAULT 'ACTIVE',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  released_at   TIMESTAMPTZ,

  CONSTRAINT slot_holds_expiry CHECK (expires_at > held_at)
);

-- CRITICAL: A slot can have at most 1 ACTIVE hold.
CREATE UNIQUE INDEX IF NOT EXISTS slot_holds_slot_active_unique
  ON public.slot_holds (slot_id) WHERE status = 'ACTIVE';

-- Hold tokens are unique globally (defense in depth for booking).
CREATE UNIQUE INDEX IF NOT EXISTS slot_holds_token_unique
  ON public.slot_holds (hold_token);

CREATE INDEX IF NOT EXISTS slot_holds_patient_status_idx
  ON public.slot_holds (patient_id, status);

CREATE INDEX IF NOT EXISTS slot_holds_expires_at_idx
  ON public.slot_holds (expires_at) WHERE status = 'ACTIVE';

-- ============================================================
-- 8. APPOINTMENTS (decoupled from medical_records)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.appointments (
  appointment_id        BIGSERIAL PRIMARY KEY,
  slot_id               BIGINT    REFERENCES public.appointment_slots(slot_id) ON DELETE SET NULL,
  patient_id            BIGINT    NOT NULL REFERENCES public.patients(patient_id) ON DELETE CASCADE,
  doctor_id             BIGINT    NOT NULL REFERENCES public.medical_staff(staff_id) ON DELETE CASCADE,
  status                appointment_status NOT NULL DEFAULT 'HELD',
  reason_for_visit      TEXT,
  booked_at             TIMESTAMPTZ,
  booked_by_user_id     UUID REFERENCES auth.users(id),
  confirmed_at          TIMESTAMPTZ,
  completed_at          TIMESTAMPTZ,
  cancelled_at          TIMESTAMPTZ,
  cancel_reason         cancel_reason_type,
  cancel_reason_text    TEXT,
  reschedule_count      INTEGER   NOT NULL DEFAULT 0,
  rescheduled_from_id   BIGINT    REFERENCES public.appointments(appointment_id) ON DELETE SET NULL,
  original_appointment_id BIGINT  REFERENCES public.appointments(appointment_id) ON DELETE SET NULL,
  timezone              TEXT      NOT NULL DEFAULT 'UTC',
  idempotency_key       TEXT,
  legacy_record_id      BIGINT    REFERENCES public.medical_records(record_id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- CRITICAL: A slot can have at most 1 non-cancelled appointment.
CREATE UNIQUE INDEX IF NOT EXISTS appointments_slot_active_unique
  ON public.appointments (slot_id)
  WHERE status IN ('HELD','CONFIRMED','COMPLETED','RESCHEDULE_REQUIRED','DOCTOR_LEAVE_CONFLICT');

-- CRITICAL: Idempotency key uniqueness — exact same booking twice = same record.
CREATE UNIQUE INDEX IF NOT EXISTS appointments_idempotency_unique
  ON public.appointments (idempotency_key) WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS appointments_patient_status_idx
  ON public.appointments (patient_id, status);

CREATE INDEX IF NOT EXISTS appointments_doctor_status_idx
  ON public.appointments (doctor_id, status);

CREATE INDEX IF NOT EXISTS appointments_slot_idx
  ON public.appointments (slot_id);

-- ============================================================
-- 9. ROW-LEVEL SECURITY
-- ============================================================

ALTER TABLE public.specialties            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.doctor_specialties     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.doctor_availability    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.doctor_leave           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointment_slots      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.slot_holds             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointments           ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 9.1 Specialties — readable by everyone (lookup table)
-- ============================================================
DROP POLICY IF EXISTS specialties_select_all ON public.specialties;
CREATE POLICY specialties_select_all
  ON public.specialties FOR SELECT
  USING (active = TRUE);

-- Admins can manage specialties.
DROP POLICY IF EXISTS specialties_admin_all ON public.specialties;
CREATE POLICY specialties_admin_all
  ON public.specialties FOR ALL
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

-- ============================================================
-- 9.2 Doctor Specialties
-- ============================================================
DROP POLICY IF EXISTS doctor_specialties_select_all ON public.doctor_specialties;
CREATE POLICY doctor_specialties_select_all
  ON public.doctor_specialties FOR SELECT
  USING (TRUE);

DROP POLICY IF EXISTS doctor_specialties_admin_write ON public.doctor_specialties;
CREATE POLICY doctor_specialties_admin_write
  ON public.doctor_specialties FOR ALL
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

-- ============================================================
-- 9.3 Doctor Availability
-- ============================================================
DROP POLICY IF EXISTS doctor_availability_select_all ON public.doctor_availability;
CREATE POLICY doctor_availability_select_all
  ON public.doctor_availability FOR SELECT
  USING (active = TRUE OR
    EXISTS (
      SELECT 1 FROM public.medical_staff ms
      WHERE ms.user_id = auth.uid() AND ms.staff_type IN ('Admin','Doctor') AND ms.staff_id = doctor_id
    )
    OR
    EXISTS (
      SELECT 1 FROM public.medical_staff ms
      WHERE ms.user_id = auth.uid() AND ms.staff_type = 'Admin'
    )
  );

DROP POLICY IF EXISTS doctor_availability_admin_doctor_write ON public.doctor_availability;
CREATE POLICY doctor_availability_admin_doctor_write
  ON public.doctor_availability FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.medical_staff ms
      WHERE ms.user_id = auth.uid() AND ms.staff_type IN ('Admin','Doctor')
            AND (ms.staff_type = 'Admin' OR ms.staff_id = doctor_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.medical_staff ms
      WHERE ms.user_id = auth.uid() AND ms.staff_type IN ('Admin','Doctor')
            AND (ms.staff_type = 'Admin' OR ms.staff_id = doctor_id)
    )
  );

-- ============================================================
-- 9.4 Doctor Leave
-- ============================================================
DROP POLICY IF EXISTS doctor_leave_select ON public.doctor_leave;
CREATE POLICY doctor_leave_select
  ON public.doctor_leave FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.medical_staff ms
      WHERE ms.user_id = auth.uid() AND (ms.staff_type IN ('Admin','Doctor') AND (ms.staff_type = 'Admin' OR ms.staff_id = doctor_id))
    )
  );

DROP POLICY IF EXISTS doctor_leave_write ON public.doctor_leave;
CREATE POLICY doctor_leave_write
  ON public.doctor_leave FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.medical_staff ms
      WHERE ms.user_id = auth.uid() AND ms.staff_type IN ('Admin','Doctor')
            AND (ms.staff_type = 'Admin' OR ms.staff_id = doctor_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.medical_staff ms
      WHERE ms.user_id = auth.uid() AND ms.staff_type IN ('Admin','Doctor')
            AND (ms.staff_type = 'Admin' OR ms.staff_id = doctor_id)
    )
  );

-- ============================================================
-- 9.5 Appointment Slots
-- ============================================================
DROP POLICY IF EXISTS appointment_slots_select ON public.appointment_slots;
CREATE POLICY appointment_slots_select
  ON public.appointment_slots FOR SELECT
  USING (TRUE);

DROP POLICY IF EXISTS appointment_slots_write ON public.appointment_slots;
CREATE POLICY appointment_slots_write
  ON public.appointment_slots FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.medical_staff ms
      WHERE ms.user_id = auth.uid() AND ms.staff_type IN ('Admin','Doctor')
            AND (ms.staff_type = 'Admin' OR ms.staff_id = doctor_id)
    )
    OR
    -- Patients can update a slot if they hold an ACTIVE hold on it (for booking flow).
    EXISTS (
      SELECT 1
      FROM public.slot_holds h
      JOIN public.patients p ON p.patient_id = h.patient_id
      WHERE h.slot_id = appointment_slots.slot_id
        AND h.status = 'ACTIVE'
        AND p.user_id = auth.uid()
    )
  );

-- Admins / background service do inserts via service role (bypasses RLS).
-- Patients & doctors do not insert slots directly.

-- ============================================================
-- 9.6 Slot Holds
-- Patient sees only their own holds.
-- Admin sees all.
-- Doctors see holds for slots they own (maybe useful later).
-- ============================================================
DROP POLICY IF EXISTS slot_holds_select ON public.slot_holds;
CREATE POLICY slot_holds_select
  ON public.slot_holds FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.patients p
      WHERE p.user_id = auth.uid() AND p.patient_id = slot_holds.patient_id
    )
    OR
    EXISTS (
      SELECT 1 FROM public.medical_staff ms
      WHERE ms.user_id = auth.uid() AND ms.staff_type IN ('Admin','Doctor')
            AND (ms.staff_type = 'Admin'
                 OR EXISTS (SELECT 1 FROM public.appointment_slots s WHERE s.slot_id = slot_holds.slot_id AND s.doctor_id = ms.staff_id))
    )
  );

DROP POLICY IF EXISTS slot_holds_write ON public.slot_holds;
CREATE POLICY slot_holds_write
  ON public.slot_holds FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.patients p
      WHERE p.user_id = auth.uid() AND p.patient_id = slot_holds.patient_id
    )
  );

DROP POLICY IF EXISTS slot_holds_update ON public.slot_holds;
CREATE POLICY slot_holds_update
  ON public.slot_holds FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.patients p
      WHERE p.user_id = auth.uid() AND p.patient_id = slot_holds.patient_id
    )
    OR
    EXISTS (
      SELECT 1 FROM public.medical_staff ms
      WHERE ms.user_id = auth.uid() AND ms.staff_type = 'Admin'
    )
  );

-- ============================================================
-- 9.7 Appointments
-- Patients: read/write only their own.
-- Doctors:   read/write appointments in their schedule.
-- Admins:    full read/write.
-- ============================================================
DROP POLICY IF EXISTS appointments_patient_select ON public.appointments;
CREATE POLICY appointments_patient_select
  ON public.appointments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.patients p
      WHERE p.user_id = auth.uid() AND p.patient_id = appointments.patient_id
    )
    OR
    EXISTS (
      SELECT 1 FROM public.medical_staff ms
      WHERE ms.user_id = auth.uid() AND (ms.staff_type = 'Admin' OR (ms.staff_type = 'Doctor' AND ms.staff_id = appointments.doctor_id))
    )
  );

DROP POLICY IF EXISTS appointments_patient_insert ON public.appointments;
CREATE POLICY appointments_patient_insert
  ON public.appointments FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.patients p
      WHERE p.user_id = auth.uid() AND p.patient_id = appointments.patient_id
    )
    OR
    EXISTS (
      SELECT 1 FROM public.medical_staff ms
      WHERE ms.user_id = auth.uid() AND (ms.staff_type = 'Admin' OR (ms.staff_type = 'Doctor' AND ms.staff_id = appointments.doctor_id))
    )
  );

DROP POLICY IF EXISTS appointments_patient_update ON public.appointments;
CREATE POLICY appointments_patient_update
  ON public.appointments FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.patients p
      WHERE p.user_id = auth.uid() AND p.patient_id = appointments.patient_id
    )
    OR
    EXISTS (
      SELECT 1 FROM public.medical_staff ms
      WHERE ms.user_id = auth.uid() AND (ms.staff_type = 'Admin' OR (ms.staff_type = 'Doctor' AND ms.staff_id = appointments.doctor_id))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.patients p
      WHERE p.user_id = auth.uid() AND p.patient_id = appointments.patient_id
    )
    OR
    EXISTS (
      SELECT 1 FROM public.medical_staff ms
      WHERE ms.user_id = auth.uid() AND (ms.staff_type = 'Admin' OR (ms.staff_type = 'Doctor' AND ms.staff_id = appointments.doctor_id))
    )
  );

-- ============================================================
-- 10. UPDATED_AT TRIGGERS
-- ============================================================

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS set_updated_specialties            ON public.specialties;
CREATE TRIGGER set_updated_specialties
  BEFORE UPDATE ON public.specialties
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_updated_doctor_availability  ON public.doctor_availability;
CREATE TRIGGER set_updated_doctor_availability
  BEFORE UPDATE ON public.doctor_availability
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_updated_doctor_leave         ON public.doctor_leave;
CREATE TRIGGER set_updated_doctor_leave
  BEFORE UPDATE ON public.doctor_leave
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_updated_appointment_slots    ON public.appointment_slots;
CREATE TRIGGER set_updated_appointment_slots
  BEFORE UPDATE ON public.appointment_slots
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_updated_appointments         ON public.appointments;
CREATE TRIGGER set_updated_appointments
  BEFORE UPDATE ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMIT;
