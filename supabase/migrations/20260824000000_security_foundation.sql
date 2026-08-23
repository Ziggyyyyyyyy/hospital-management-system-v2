-- ============================================================
-- PHASE 1 — SECURITY FOUNDATION MIGRATION
-- Timestamp: 20260824000000
-- Scope:
--   • Non-recursive RLS helper functions (SECURITY DEFINER)
--   • Fix RLS recursion on medical_staff and users
--   • Append-only audit_logs table with immutable triggers
--   • Audit logging RLS policies (Admin read-only, authenticated append)
--   • Security Definer audit log RPC helper
-- ============================================================

BEGIN;

-- ============================================================
-- 1. SECURITY DEFINER ROLE & IDENTITY RESOLUTION FUNCTIONS
--    Running as SECURITY DEFINER with explicit search_path prevents
--    RLS recursion (SQLSTATE 54001) during policy evaluation.
-- ============================================================

CREATE OR REPLACE FUNCTION public.current_user_staff_type()
RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ms.staff_type
    FROM public.medical_staff ms
   WHERE ms.user_id = auth.uid()
   LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.get_auth_user_role()
RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT ms.staff_type FROM public.medical_staff ms WHERE ms.user_id = auth.uid() LIMIT 1),
    'Patient'
  );
$$;

CREATE OR REPLACE FUNCTION public.get_auth_patient_id()
RETURNS BIGINT
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.patient_id
    FROM public.patients p
   WHERE p.user_id = auth.uid()
   LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.get_auth_staff_id()
RETURNS BIGINT
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT ms.staff_id
    FROM public.medical_staff ms
   WHERE ms.user_id = auth.uid()
   LIMIT 1;
$$;

-- ============================================================
-- 2. RE-APPLY NON-RECURSIVE RLS POLICIES FOR USERS & MEDICAL_STAFF
-- ============================================================

-- Medical staff read policy using SECURITY DEFINER helper
DROP POLICY IF EXISTS medical_staff_read ON public.medical_staff;
CREATE POLICY medical_staff_read ON public.medical_staff FOR SELECT
  USING (
    user_id = auth.uid()
    OR public.current_user_staff_type() IN ('Admin','Doctor','Nurse','Pharmacist')
  );

-- Users self read policy using SECURITY DEFINER helper
DROP POLICY IF EXISTS users_select_self ON public.users;
CREATE POLICY users_select_self ON public.users FOR SELECT
  USING (
    user_id = auth.uid()
    OR public.current_user_staff_type() IN ('Admin','Doctor','Nurse','Pharmacist')
  );

-- Patients self read/write using SECURITY DEFINER helper
DROP POLICY IF EXISTS patients_self_read_write ON public.patients;
CREATE POLICY patients_self_read_write ON public.patients FOR SELECT
  USING (
    user_id = auth.uid()
    OR public.current_user_staff_type() IN ('Admin','Doctor','Nurse','Pharmacist')
  );

-- ============================================================
-- 3. AUDIT LOGS — IMMUTABLE, APPEND-ONLY SECURITY AUDIT TRAIL
-- ============================================================

CREATE TABLE IF NOT EXISTS public.audit_logs (
  log_id          BIGSERIAL PRIMARY KEY,
  actor_user_id   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_role      TEXT NOT NULL,
  action          TEXT NOT NULL,
  resource_type   TEXT NOT NULL,
  resource_id     TEXT,
  diff_payload    JSONB,
  ip_address      TEXT,
  user_agent      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Optimization indexes for audit trail queries
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor
  ON public.audit_logs (actor_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_resource
  ON public.audit_logs (resource_type, resource_id);

CREATE INDEX IF NOT EXISTS idx_audit_logs_action
  ON public.audit_logs (action, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at
  ON public.audit_logs (created_at DESC);

-- ============================================================
-- 4. IMMUTABILITY TRIGGER: PREVENT UPDATE OR DELETE ON AUDIT_LOGS
-- ============================================================

CREATE OR REPLACE FUNCTION public.prevent_audit_log_modification()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs is an append-only security table. Modifications and deletions are strictly forbidden.'
    USING ERRCODE = '55000';
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_logs_immutable ON public.audit_logs;
CREATE TRIGGER trg_audit_logs_immutable
  BEFORE UPDATE OR DELETE ON public.audit_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_audit_log_modification();

-- ============================================================
-- 5. AUDIT LOGS ROW-LEVEL SECURITY
-- ============================================================

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Admins can read all audit logs
DROP POLICY IF EXISTS audit_logs_admin_select ON public.audit_logs;
CREATE POLICY audit_logs_admin_select ON public.audit_logs FOR SELECT
  USING (public.current_user_staff_type() = 'Admin');

-- Authenticated actors can insert their own audit entries
DROP POLICY IF EXISTS audit_logs_auth_insert ON public.audit_logs;
CREATE POLICY audit_logs_auth_insert ON public.audit_logs FOR INSERT
  WITH CHECK (
    actor_user_id IS NULL OR actor_user_id = auth.uid()
  );

-- ============================================================
-- 6. SECURITY DEFINER RPC: log_audit_event()
-- ============================================================

CREATE OR REPLACE FUNCTION public.log_audit_event(
  p_action        TEXT,
  p_resource_type TEXT,
  p_resource_id   TEXT DEFAULT NULL,
  p_diff_payload  JSONB DEFAULT NULL,
  p_ip_address    TEXT DEFAULT NULL,
  p_user_agent    TEXT DEFAULT NULL
)
RETURNS BIGINT
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _log_id BIGINT;
  _role   TEXT;
BEGIN
  _role := public.get_auth_user_role();

  INSERT INTO public.audit_logs (
    actor_user_id,
    actor_role,
    action,
    resource_type,
    resource_id,
    diff_payload,
    ip_address,
    user_agent,
    created_at
  ) VALUES (
    auth.uid(),
    _role,
    p_action,
    p_resource_type,
    p_resource_id,
    p_diff_payload,
    p_ip_address,
    p_user_agent,
    NOW()
  ) RETURNING audit_logs.log_id INTO _log_id;

  RETURN _log_id;
END;
$$;

COMMIT;
