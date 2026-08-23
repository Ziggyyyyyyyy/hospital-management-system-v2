BEGIN;

-- ============================================================
-- 1. PATIENT SYMPTOM INTAKE
-- ============================================================

CREATE TABLE IF NOT EXISTS public.symptom_intakes (
  symptom_intake_id BIGSERIAL PRIMARY KEY,

  appointment_id BIGINT NOT NULL
    REFERENCES public.appointments(appointment_id)
    ON DELETE CASCADE,

  patient_id BIGINT NOT NULL
    REFERENCES public.patients(patient_id)
    ON DELETE CASCADE,

  symptoms TEXT NOT NULL,

  severity TEXT
    CHECK (severity IN ('MILD', 'MODERATE', 'SEVERE')),

  duration_text TEXT,

  worsening BOOLEAN,

  additional_context TEXT,

  ai_processing_consent BOOLEAN NOT NULL DEFAULT FALSE,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT symptom_intake_one_per_appointment
    UNIQUE (appointment_id)
);

CREATE INDEX IF NOT EXISTS symptom_intakes_patient_idx
  ON public.symptom_intakes(patient_id);

CREATE INDEX IF NOT EXISTS symptom_intakes_appointment_idx
  ON public.symptom_intakes(appointment_id);


-- ============================================================
-- 2. AI PRE-VISIT SUMMARY
-- ============================================================

CREATE TABLE IF NOT EXISTS public.ai_previsit_summaries (
  summary_id BIGSERIAL PRIMARY KEY,

  appointment_id BIGINT NOT NULL
    REFERENCES public.appointments(appointment_id)
    ON DELETE CASCADE,

  patient_id BIGINT NOT NULL
    REFERENCES public.patients(patient_id)
    ON DELETE CASCADE,

  doctor_id BIGINT NOT NULL
    REFERENCES public.medical_staff(staff_id)
    ON DELETE CASCADE,

  urgency TEXT
    CHECK (urgency IN ('LOW', 'MEDIUM', 'HIGH')),

  chief_complaint TEXT,

  suggested_questions JSONB NOT NULL DEFAULT '[]'::JSONB,

  model TEXT,

  prompt_version TEXT,

  status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (
      status IN (
        'PENDING',
        'PROCESSING',
        'COMPLETED',
        'FAILED'
      )
    ),

  raw_response JSONB,

  error_message TEXT,

  generated_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT ai_previsit_one_per_appointment
    UNIQUE (appointment_id)
);

CREATE INDEX IF NOT EXISTS ai_previsit_patient_idx
  ON public.ai_previsit_summaries(patient_id);

CREATE INDEX IF NOT EXISTS ai_previsit_doctor_idx
  ON public.ai_previsit_summaries(doctor_id);

CREATE INDEX IF NOT EXISTS ai_previsit_status_idx
  ON public.ai_previsit_summaries(status);


-- ============================================================
-- 3. RLS
-- ============================================================

ALTER TABLE public.symptom_intakes ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.ai_previsit_summaries ENABLE ROW LEVEL SECURITY;


-- ============================================================
-- 4. PATIENT → OWN SYMPTOMS
-- ============================================================

CREATE POLICY symptom_intakes_patient_select
ON public.symptom_intakes
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.patients p
    WHERE p.patient_id = symptom_intakes.patient_id
      AND p.user_id = auth.uid()
  )
);


CREATE POLICY symptom_intakes_patient_insert
ON public.symptom_intakes
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.patients p
    WHERE p.patient_id = symptom_intakes.patient_id
      AND p.user_id = auth.uid()
  )
);


CREATE POLICY symptom_intakes_patient_update
ON public.symptom_intakes
FOR UPDATE
USING (
  EXISTS (
    SELECT 1
    FROM public.patients p
    WHERE p.patient_id = symptom_intakes.patient_id
      AND p.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.patients p
    WHERE p.patient_id = symptom_intakes.patient_id
      AND p.user_id = auth.uid()
  )
);


-- ============================================================
-- 5. DOCTOR → SYMPTOMS FOR THEIR APPOINTMENTS
-- ============================================================

CREATE POLICY symptom_intakes_doctor_select
ON public.symptom_intakes
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.medical_staff ms
    JOIN public.appointments a
      ON a.doctor_id = ms.staff_id
    WHERE ms.user_id = auth.uid()
      AND ms.staff_type = 'Doctor'
      AND a.appointment_id = symptom_intakes.appointment_id
  )
);


-- ============================================================
-- 6. PATIENT → OWN AI SUMMARY
-- ============================================================

CREATE POLICY ai_previsit_patient_select
ON public.ai_previsit_summaries
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.patients p
    WHERE p.patient_id = ai_previsit_summaries.patient_id
      AND p.user_id = auth.uid()
  )
);


-- ============================================================
-- 7. DOCTOR → THEIR AI SUMMARIES
-- ============================================================

CREATE POLICY ai_previsit_doctor_select
ON public.ai_previsit_summaries
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.medical_staff ms
    WHERE ms.user_id = auth.uid()
      AND ms.staff_type = 'Doctor'
      AND ms.staff_id = ai_previsit_summaries.doctor_id
  )
);


-- ============================================================
-- 8. UPDATED_AT
-- ============================================================

DROP TRIGGER IF EXISTS symptom_intakes_updated_at
ON public.symptom_intakes;

CREATE TRIGGER symptom_intakes_updated_at
BEFORE UPDATE ON public.symptom_intakes
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();


DROP TRIGGER IF EXISTS ai_previsit_summaries_updated_at
ON public.ai_previsit_summaries;

CREATE TRIGGER ai_previsit_summaries_updated_at
BEFORE UPDATE ON public.ai_previsit_summaries
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();


COMMIT;