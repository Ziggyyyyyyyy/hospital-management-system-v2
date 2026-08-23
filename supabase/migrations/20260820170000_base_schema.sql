-- ============================================================
-- PHASE 0 — BASE DOMAIN SCHEMA (Foundational Tables)
-- Timestamp: 20260820170000 (before appointment migrations)
-- Scope:
--   • users, departments, medical_staff, patients
--   • rooms, admissions, medical_records, treatments
--   • billing, billing_items
--   • medicine_stock, medicine_dispense
--   • RLS policies for each table
--   • updated_at triggers
-- ============================================================
-- This is the PRE-REQUISITE for all later migrations
-- (appointment_domain, appointment_rpc, ai_visit_intelligence,
--  post-visit, notifications, calendar, reminders, etc.)
-- ============================================================

BEGIN;

-- ============================================================
-- 0. EXTENSIONS
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- 1. USERS — public profile mirror of auth.users
--    Created on sign-up (see app/actions.ts signUpAction)
--    One-to-one with auth.users via user_id FK
-- ============================================================
CREATE TABLE IF NOT EXISTS public.users (
  user_id         UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  national_id     TEXT,
  first_name      TEXT NOT NULL,
  last_name       TEXT NOT NULL,
  date_of_birth   DATE,
  gender          TEXT,
  address         TEXT,
  phone_number    TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS users_national_id_idx ON public.users (national_id);
CREATE INDEX IF NOT EXISTS users_name_idx ON public.users (first_name, last_name);

-- ============================================================
-- 2. DEPARTMENTS — lookup table for rooms + medical_staff
-- ============================================================
CREATE TABLE IF NOT EXISTS public.departments (
  department_id   BIGSERIAL PRIMARY KEY,
  name            TEXT      NOT NULL,
  description     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS departments_name_unique
  ON public.departments (name);

-- Seed departments (idempotent)
INSERT INTO public.departments (name, description) VALUES
  ('General Medicine',   'Primary care and internal medicine'),
  ('Cardiology',         'Heart and cardiovascular conditions'),
  ('Dermatology',        'Skin, hair, and nail disorders'),
  ('Neurology',          'Nervous system disorders'),
  ('Pediatrics',         'Infant, child, and adolescent care'),
  ('Orthopedics',        'Musculoskeletal system and joints'),
  ('Gynecology',         'Women reproductive health'),
  ('Ophthalmology',      'Eye care and vision'),
  ('ENT',                'Ear, nose, and throat'),
  ('Psychiatry',         'Mental health and psychiatric care'),
  ('Emergency',          'Emergency and urgent care'),
  ('Radiology',          'Medical imaging and diagnostics'),
  ('Surgery',            'General and specialized surgery'),
  ('ICU',                'Intensive care unit'),
  ('Pharmacy',           'Pharmaceutical services')
ON CONFLICT (name) DO NOTHING;

-- ============================================================
-- 3. MEDICAL_STAFF — doctors, nurses, pharmacists, admins
--    staff_type: 'Doctor' | 'Nurse' | 'Pharmacist' | 'Admin'
--    employment_status: 'Active' | 'On_Leave' | 'Resigned' | 'Retired'
-- ============================================================
CREATE TABLE IF NOT EXISTS public.medical_staff (
  staff_id          BIGSERIAL PRIMARY KEY,
  user_id           UUID      NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
  department_id     BIGINT    REFERENCES public.departments(department_id) ON DELETE SET NULL,
  staff_type        TEXT      NOT NULL,
  license_number    TEXT,
  employment_status TEXT      NOT NULL DEFAULT 'Active',
  date_hired        DATE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT medical_staff_staff_type_check
    CHECK (staff_type IN ('Doctor','Nurse','Pharmacist','Admin')),
  CONSTRAINT medical_staff_employment_check
    CHECK (employment_status IN ('Active','On_Leave','Resigned','Retired'))
);

CREATE UNIQUE INDEX IF NOT EXISTS medical_staff_user_id_unique
  ON public.medical_staff (user_id);
CREATE INDEX IF NOT EXISTS medical_staff_staff_type_idx
  ON public.medical_staff (staff_type);
CREATE INDEX IF NOT EXISTS medical_staff_department_idx
  ON public.medical_staff (department_id);
CREATE INDEX IF NOT EXISTS medical_staff_employment_idx
  ON public.medical_staff (employment_status);

-- ============================================================
-- 4. PATIENTS — patient profile (one-to-one with users via user_id)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.patients (
  patient_id          BIGSERIAL PRIMARY KEY,
  user_id             UUID      NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
  blood_type          TEXT,
  emergency_contact_id TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT patients_blood_type_check
    CHECK (blood_type IN ('A+','A-','B+','B-','AB+','AB-','O+','O-'))
);

CREATE UNIQUE INDEX IF NOT EXISTS patients_user_id_unique
  ON public.patients (user_id);
CREATE INDEX IF NOT EXISTS patients_blood_type_idx
  ON public.patients (blood_type);

-- ============================================================
-- 5. ROOMS — hospital rooms / beds
-- ============================================================
CREATE TABLE IF NOT EXISTS public.rooms (
  room_id         BIGSERIAL PRIMARY KEY,
  room_type       TEXT      NOT NULL,
  department_id   BIGINT    REFERENCES public.departments(department_id) ON DELETE SET NULL,
  price_per_night NUMERIC(12,2) NOT NULL DEFAULT 0,
  capacity        INTEGER   NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT rooms_room_type_check
    CHECK (room_type IN ('General','ICU','Private','Emergency','Operating','Recovery'))
);

CREATE INDEX IF NOT EXISTS rooms_department_idx ON public.rooms (department_id);
CREATE INDEX IF NOT EXISTS rooms_type_idx ON public.rooms (room_type);
CREATE INDEX IF NOT EXISTS rooms_capacity_idx ON public.rooms (capacity);

-- ============================================================
-- 6. ADMISSIONS — inpatient stays
-- ============================================================
CREATE TABLE IF NOT EXISTS public.admissions (
  admission_id    BIGSERIAL PRIMARY KEY,
  patient_id      BIGINT    NOT NULL REFERENCES public.patients(patient_id) ON DELETE CASCADE,
  room_id         BIGINT    REFERENCES public.rooms(room_id) ON DELETE SET NULL,
  nurse_id        BIGINT    REFERENCES public.medical_staff(staff_id) ON DELETE SET NULL,
  doctor_id       BIGINT    REFERENCES public.medical_staff(staff_id) ON DELETE SET NULL,
  admission_date  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  discharge_date  TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS admissions_patient_idx ON public.admissions (patient_id);
CREATE INDEX IF NOT EXISTS admissions_room_idx ON public.admissions (room_id);
CREATE INDEX IF NOT EXISTS admissions_doctor_idx ON public.admissions (doctor_id);
CREATE INDEX IF NOT EXISTS admissions_nurse_idx ON public.admissions (nurse_id);
CREATE INDEX IF NOT EXISTS admissions_date_idx ON public.admissions (admission_date, discharge_date);

-- ============================================================
-- 7. MEDICAL_RECORDS — visit / consultation records
-- ============================================================
CREATE TABLE IF NOT EXISTS public.medical_records (
  record_id         BIGSERIAL PRIMARY KEY,
  patient_id        BIGINT    NOT NULL REFERENCES public.patients(patient_id) ON DELETE CASCADE,
  doctor_id         BIGINT    REFERENCES public.medical_staff(staff_id) ON DELETE SET NULL,
  symptoms          TEXT,
  diagnosis         TEXT,
  treatment_plan    TEXT,
  medicine_prescribed TEXT,
  visit_date        DATE      NOT NULL DEFAULT CURRENT_DATE,
  visit_status      TEXT      NOT NULL DEFAULT 'Scheduled',
  patient_status    TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT records_visit_status_check
    CHECK (visit_status IN ('Scheduled','In_Progress','Completed','Canceled','No_Show'))
);

CREATE INDEX IF NOT EXISTS records_patient_idx ON public.medical_records (patient_id);
CREATE INDEX IF NOT EXISTS records_doctor_idx ON public.medical_records (doctor_id);
CREATE INDEX IF NOT EXISTS records_visit_date_idx ON public.medical_records (visit_date);
CREATE INDEX IF NOT EXISTS records_visit_status_idx ON public.medical_records (visit_status);

-- ============================================================
-- 8. TREATMENTS — treatment items referenced in medical_records
-- ============================================================
CREATE TABLE IF NOT EXISTS public.treatments (
  treatment_id    BIGSERIAL PRIMARY KEY,
  record_id       BIGINT    REFERENCES public.medical_records(record_id) ON DELETE CASCADE,
  name            TEXT      NOT NULL,
  description     TEXT,
  cost            NUMERIC(12,2) NOT NULL DEFAULT 0,
  performed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS treatments_record_idx ON public.treatments (record_id);

-- ============================================================
-- 9. BILLING — invoices
-- ============================================================
CREATE TABLE IF NOT EXISTS public.billing (
  bill_id         BIGSERIAL PRIMARY KEY,
  patient_id      BIGINT    NOT NULL REFERENCES public.patients(patient_id) ON DELETE CASCADE,
  total_price     NUMERIC(12,2) NOT NULL DEFAULT 0,
  status          TEXT      NOT NULL DEFAULT 'Pending',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT billing_status_check
    CHECK (status IN ('Pending','Paid','Partial','Overdue','Cancelled','Waived'))
);

CREATE INDEX IF NOT EXISTS billing_patient_idx ON public.billing (patient_id);
CREATE INDEX IF NOT EXISTS billing_status_idx ON public.billing (status);

-- ============================================================
-- 10. BILLING_ITEMS — line items on a bill
-- ============================================================
CREATE TABLE IF NOT EXISTS public.billing_items (
  item_id         BIGSERIAL PRIMARY KEY,
  bill_id         BIGINT    NOT NULL REFERENCES public.billing(bill_id) ON DELETE CASCADE,
  item_type       TEXT      NOT NULL,
  item_id_ref     BIGINT,
  description     TEXT,
  quantity        INTEGER   NOT NULL DEFAULT 1,
  unit_price      NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_price     NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT billing_items_quantity_check CHECK (quantity > 0),
  CONSTRAINT billing_items_price_nonneg CHECK (unit_price >= 0 AND total_price >= 0)
);

CREATE INDEX IF NOT EXISTS billing_items_bill_idx ON public.billing_items (bill_id);
CREATE INDEX IF NOT EXISTS billing_items_type_idx ON public.billing_items (item_type);

-- ============================================================
-- 11. MEDICINE_STOCK — pharmacy inventory
-- ============================================================
CREATE TABLE IF NOT EXISTS public.medicine_stock (
  medicine_id     BIGSERIAL PRIMARY KEY,
  name            TEXT      NOT NULL,
  generic_name    TEXT,
  category        TEXT,
  dosage_form     TEXT,
  strength        TEXT,
  quantity        INTEGER   NOT NULL DEFAULT 0,
  reorder_level   INTEGER   NOT NULL DEFAULT 0,
  unit_price      NUMERIC(12,2) NOT NULL DEFAULT 0,
  expiry_date     DATE,
  manufacturer    TEXT,
  batch_number    TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT medicine_quantity_nonneg CHECK (quantity >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS medicine_name_batch_unique
  ON public.medicine_stock (name, COALESCE(batch_number, ''));
CREATE INDEX IF NOT EXISTS medicine_category_idx ON public.medicine_stock (category);
CREATE INDEX IF NOT EXISTS medicine_expiry_idx ON public.medicine_stock (expiry_date);
CREATE INDEX IF NOT EXISTS medicine_quantity_idx ON public.medicine_stock (quantity);

-- ============================================================
-- 12. MEDICINE_DISPENSE — record of medicine dispensed
-- ============================================================
CREATE TABLE IF NOT EXISTS public.medicine_dispense (
  dispense_id     BIGSERIAL PRIMARY KEY,
  record_id       BIGINT    REFERENCES public.medical_records(record_id) ON DELETE SET NULL,
  pharmacist_id   BIGINT    REFERENCES public.medical_staff(staff_id) ON DELETE SET NULL,
  medicine_id     BIGINT    REFERENCES public.medicine_stock(medicine_id) ON DELETE SET NULL,
  quantity        INTEGER   NOT NULL,
  dispense_date   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  instructions    TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT medicine_dispense_qty_pos CHECK (quantity > 0)
);

CREATE INDEX IF NOT EXISTS medicine_dispense_record_idx ON public.medicine_dispense (record_id);
CREATE INDEX IF NOT EXISTS medicine_dispense_pharmacist_idx ON public.medicine_dispense (pharmacist_id);
CREATE INDEX IF NOT EXISTS medicine_dispense_medicine_idx ON public.medicine_dispense (medicine_id);
CREATE INDEX IF NOT EXISTS medicine_dispense_date_idx ON public.medicine_dispense (dispense_date);

-- ============================================================
-- 13. ROW-LEVEL SECURITY — ENABLE ON ALL TABLES
-- ============================================================
ALTER TABLE public.users              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.departments        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medical_staff      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patients           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rooms              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admissions         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medical_records    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.treatments         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_items      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medicine_stock     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medicine_dispense  ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 14. RLS — HELPER: current_user_staff_type()
-- ============================================================
CREATE OR REPLACE FUNCTION public.current_user_staff_type()
RETURNS TEXT
LANGUAGE sql STABLE
AS $$
  SELECT ms.staff_type
    FROM public.medical_staff ms
   WHERE ms.user_id = auth.uid()
   LIMIT 1;
$$;

-- ============================================================
-- 15. RLS POLICIES — users
--     Users see:
--       own profile
--       Admins: all
--       Doctors/Nurses/Pharmacists: can read patient names for care
-- ============================================================
DROP POLICY IF EXISTS users_select_self ON public.users;
CREATE POLICY users_select_self ON public.users FOR SELECT
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.medical_staff ms
       WHERE ms.user_id = auth.uid()
         AND ms.staff_type IN ('Admin','Doctor','Nurse','Pharmacist')
    )
  );

DROP POLICY IF EXISTS users_update_self ON public.users;
CREATE POLICY users_update_self ON public.users FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS users_insert_auth ON public.users;
CREATE POLICY users_insert_auth ON public.users FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- ============================================================
-- 16. RLS POLICIES — departments (all authenticated read; admin write)
-- ============================================================
DROP POLICY IF EXISTS departments_all_read ON public.departments;
CREATE POLICY departments_all_read ON public.departments FOR SELECT
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS departments_admin_write ON public.departments;
CREATE POLICY departments_admin_write ON public.departments FOR ALL
  USING (public.current_user_staff_type() = 'Admin')
  WITH CHECK (public.current_user_staff_type() = 'Admin');

-- ============================================================
-- 17. RLS POLICIES — medical_staff
-- ============================================================
DROP POLICY IF EXISTS medical_staff_read ON public.medical_staff;
CREATE POLICY medical_staff_read ON public.medical_staff FOR SELECT
  USING (
    user_id = auth.uid()
    OR public.current_user_staff_type() IN ('Admin','Doctor','Nurse','Pharmacist')
  );

DROP POLICY IF EXISTS medical_staff_admin_write ON public.medical_staff;
CREATE POLICY medical_staff_admin_write ON public.medical_staff FOR ALL
  USING (public.current_user_staff_type() = 'Admin')
  WITH CHECK (public.current_user_staff_type() = 'Admin');

-- Staff may update their own row.
-- RLS handles ownership; the trigger below handles old-vs-new
-- privilege-sensitive columns.
DROP POLICY IF EXISTS medical_staff_self_update ON public.medical_staff;

CREATE POLICY medical_staff_self_update
ON public.medical_staff
FOR UPDATE
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Prevent non-admin staff from changing their own
-- staff_type or employment_status.
CREATE OR REPLACE FUNCTION public.prevent_medical_staff_self_escalation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF public.current_user_staff_type() <> 'Admin' THEN

    IF NEW.staff_type IS DISTINCT FROM OLD.staff_type THEN
      RAISE EXCEPTION 'Only Admin can change staff_type';
    END IF;

    IF NEW.employment_status IS DISTINCT FROM OLD.employment_status THEN
      RAISE EXCEPTION 'Only Admin can change employment_status';
    END IF;

  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS check_medical_staff_self_update
ON public.medical_staff;

CREATE TRIGGER check_medical_staff_self_update
BEFORE UPDATE ON public.medical_staff
FOR EACH ROW
EXECUTE FUNCTION public.prevent_medical_staff_self_escalation();

-- ============================================================
-- 18. RLS POLICIES — patients
--     Patients: read/write own
--     Staff: read all
--     Admin: full access
-- ============================================================
DROP POLICY IF EXISTS patients_self_read_write ON public.patients;
CREATE POLICY patients_self_read_write ON public.patients FOR SELECT
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.medical_staff ms
       WHERE ms.user_id = auth.uid()
         AND ms.staff_type IN ('Admin','Doctor','Nurse','Pharmacist')
    )
  );

DROP POLICY IF EXISTS patients_self_insert ON public.patients;
CREATE POLICY patients_self_insert ON public.patients FOR INSERT
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS patients_self_update ON public.patients;
CREATE POLICY patients_self_update ON public.patients FOR UPDATE
  USING (
    user_id = auth.uid()
    OR public.current_user_staff_type() = 'Admin'
  )
  WITH CHECK (
    user_id = auth.uid()
    OR public.current_user_staff_type() = 'Admin'
  );

-- ============================================================
-- 19. RLS POLICIES — rooms (doctors/admins read; admin write)
-- ============================================================
DROP POLICY IF EXISTS rooms_read ON public.rooms;
CREATE POLICY rooms_read ON public.rooms FOR SELECT
  USING (
    public.current_user_staff_type() IN ('Admin','Doctor','Nurse')
  );

DROP POLICY IF EXISTS rooms_admin_write ON public.rooms;
CREATE POLICY rooms_admin_write ON public.rooms FOR ALL
  USING (public.current_user_staff_type() = 'Admin')
  WITH CHECK (public.current_user_staff_type() = 'Admin');

-- ============================================================
-- 20. RLS POLICIES — admissions
-- ============================================================
DROP POLICY IF EXISTS admissions_read ON public.admissions;
CREATE POLICY admissions_read ON public.admissions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.patients p
       WHERE p.patient_id = admissions.patient_id AND p.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.medical_staff ms
       WHERE ms.user_id = auth.uid()
         AND ms.staff_type IN ('Admin','Doctor','Nurse')
         AND (
           ms.staff_type = 'Admin'
           OR ms.staff_id = admissions.doctor_id
           OR ms.staff_id = admissions.nurse_id
           OR ms.staff_type = 'Nurse'
         )
    )
  );

DROP POLICY IF EXISTS admissions_write ON public.admissions;
CREATE POLICY admissions_write ON public.admissions FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.medical_staff ms
       WHERE ms.user_id = auth.uid()
         AND ms.staff_type IN ('Admin','Doctor','Nurse')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.medical_staff ms
       WHERE ms.user_id = auth.uid()
         AND ms.staff_type IN ('Admin','Doctor','Nurse')
    )
  );

-- ============================================================
-- 21. RLS POLICIES — medical_records
-- ============================================================
DROP POLICY IF EXISTS records_patient_read ON public.medical_records;
CREATE POLICY records_patient_read ON public.medical_records FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.patients p
       WHERE p.patient_id = medical_records.patient_id AND p.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.medical_staff ms
       WHERE ms.user_id = auth.uid()
         AND ms.staff_type IN ('Admin','Doctor','Nurse','Pharmacist')
    )
  );

DROP POLICY IF EXISTS records_doctor_write ON public.medical_records;
CREATE POLICY records_doctor_write ON public.medical_records FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.medical_staff ms
       WHERE ms.user_id = auth.uid()
         AND (ms.staff_type = 'Doctor' OR ms.staff_type = 'Admin')
    )
  );

DROP POLICY IF EXISTS records_update ON public.medical_records;
CREATE POLICY records_update ON public.medical_records FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.medical_staff ms
       WHERE ms.user_id = auth.uid()
         AND (ms.staff_type = 'Admin' OR (ms.staff_type = 'Doctor' AND ms.staff_id = medical_records.doctor_id))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.medical_staff ms
       WHERE ms.user_id = auth.uid()
         AND (ms.staff_type = 'Admin' OR (ms.staff_type = 'Doctor' AND ms.staff_id = medical_records.doctor_id))
    )
  );

-- ============================================================
-- 22. RLS POLICIES — treatments (inherit read from records; doctor/admin write)
-- ============================================================
DROP POLICY IF EXISTS treatments_read ON public.treatments;
CREATE POLICY treatments_read ON public.treatments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.patients p
      JOIN public.medical_records mr ON mr.patient_id = p.patient_id
       WHERE p.user_id = auth.uid() AND mr.record_id = treatments.record_id
    )
    OR EXISTS (
      SELECT 1 FROM public.medical_staff ms
       WHERE ms.user_id = auth.uid()
         AND ms.staff_type IN ('Admin','Doctor','Nurse','Pharmacist')
    )
  );

DROP POLICY IF EXISTS treatments_write ON public.treatments;
CREATE POLICY treatments_write ON public.treatments FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.medical_staff ms
       WHERE ms.user_id = auth.uid()
         AND (ms.staff_type IN ('Admin','Doctor'))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.medical_staff ms
       WHERE ms.user_id = auth.uid()
         AND (ms.staff_type IN ('Admin','Doctor'))
    )
  );

-- ============================================================
-- 23. RLS POLICIES — billing
-- ============================================================
DROP POLICY IF EXISTS billing_read ON public.billing;
CREATE POLICY billing_read ON public.billing FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.patients p
       WHERE p.patient_id = billing.patient_id AND p.user_id = auth.uid()
    )
    OR public.current_user_staff_type() = 'Admin'
  );

DROP POLICY IF EXISTS billing_admin_write ON public.billing;
CREATE POLICY billing_admin_write ON public.billing FOR ALL
  USING (public.current_user_staff_type() = 'Admin')
  WITH CHECK (public.current_user_staff_type() = 'Admin');

-- ============================================================
-- 24. RLS POLICIES — billing_items (inherit billing read; admin write)
-- ============================================================
DROP POLICY IF EXISTS billing_items_read ON public.billing_items;
CREATE POLICY billing_items_read ON public.billing_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.patients p
      JOIN public.billing b ON b.patient_id = p.patient_id
       WHERE p.user_id = auth.uid() AND b.bill_id = billing_items.bill_id
    )
    OR public.current_user_staff_type() = 'Admin'
  );

DROP POLICY IF EXISTS billing_items_admin_write ON public.billing_items;
CREATE POLICY billing_items_admin_write ON public.billing_items FOR ALL
  USING (public.current_user_staff_type() = 'Admin')
  WITH CHECK (public.current_user_staff_type() = 'Admin');

-- ============================================================
-- 25. RLS POLICIES — medicine_stock (pharmacy + admin read/write; doctors read)
-- ============================================================
DROP POLICY IF EXISTS medicine_stock_read ON public.medicine_stock;
CREATE POLICY medicine_stock_read ON public.medicine_stock FOR SELECT
  USING (
    public.current_user_staff_type() IN ('Admin','Doctor','Nurse','Pharmacist')
  );

DROP POLICY IF EXISTS medicine_stock_pharmacy_write ON public.medicine_stock;
CREATE POLICY medicine_stock_pharmacy_write ON public.medicine_stock FOR ALL
  USING (public.current_user_staff_type() IN ('Admin','Pharmacist'))
  WITH CHECK (public.current_user_staff_type() IN ('Admin','Pharmacist'));

-- ============================================================
-- 26. RLS POLICIES — medicine_dispense
-- ============================================================
DROP POLICY IF EXISTS medicine_dispense_read ON public.medicine_dispense;
CREATE POLICY medicine_dispense_read ON public.medicine_dispense FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.patients p
      JOIN public.medical_records mr ON mr.patient_id = p.patient_id
       WHERE p.user_id = auth.uid() AND mr.record_id = medicine_dispense.record_id
    )
    OR public.current_user_staff_type() IN ('Admin','Doctor','Nurse','Pharmacist')
  );

DROP POLICY IF EXISTS medicine_dispense_write ON public.medicine_dispense;
CREATE POLICY medicine_dispense_write ON public.medicine_dispense FOR ALL
  USING (public.current_user_staff_type() IN ('Admin','Pharmacist'))
  WITH CHECK (public.current_user_staff_type() IN ('Admin','Pharmacist'));

-- ============================================================
-- 27. SHARED updated_at() TRIGGER FUNCTION
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END; $$;

-- ============================================================
-- 28. TRIGGERS — set_updated_at on all base tables
-- ============================================================
DROP TRIGGER IF EXISTS set_updated_users           ON public.users;
CREATE TRIGGER set_updated_users
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_updated_departments     ON public.departments;
CREATE TRIGGER set_updated_departments
  BEFORE UPDATE ON public.departments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_updated_medical_staff   ON public.medical_staff;
CREATE TRIGGER set_updated_medical_staff
  BEFORE UPDATE ON public.medical_staff
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_updated_patients        ON public.patients;
CREATE TRIGGER set_updated_patients
  BEFORE UPDATE ON public.patients
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_updated_rooms           ON public.rooms;
CREATE TRIGGER set_updated_rooms
  BEFORE UPDATE ON public.rooms
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_updated_admissions      ON public.admissions;
CREATE TRIGGER set_updated_admissions
  BEFORE UPDATE ON public.admissions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_updated_medical_records ON public.medical_records;
CREATE TRIGGER set_updated_medical_records
  BEFORE UPDATE ON public.medical_records
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_updated_treatments      ON public.treatments;
CREATE TRIGGER set_updated_treatments
  BEFORE UPDATE ON public.treatments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_updated_billing         ON public.billing;
CREATE TRIGGER set_updated_billing
  BEFORE UPDATE ON public.billing
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_updated_billing_items   ON public.billing_items;
CREATE TRIGGER set_updated_billing_items
  BEFORE UPDATE ON public.billing_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_updated_medicine_stock  ON public.medicine_stock;
CREATE TRIGGER set_updated_medicine_stock
  BEFORE UPDATE ON public.medicine_stock
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_updated_medicine_dispense ON public.medicine_dispense;
CREATE TRIGGER set_updated_medicine_dispense
  BEFORE UPDATE ON public.medicine_dispense
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMIT;
