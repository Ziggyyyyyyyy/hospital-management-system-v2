-- ============================================================
-- PHASE 1 — APPOINTMENT DOMAIN RPC FUNCTIONS
-- Timestamp: 20260820181000
--
-- Provides atomic / transactional operations called via
-- Supabase RPC. These are the ONLY authoritative paths for
-- holds and booking.
--
-- 1. expire_stale_holds()       – manual expiry sweep
-- 2. atomic_hold_slot()         – acquire hold on slot (w/ advisory lock)
-- 3. atomic_release_hold()      – release a hold
-- 4. atomic_confirm_booking()   – consume hold → BOOKED + appointment
-- 5. cancel_appointment()       – patient-initiated cancel
-- 6. process_doctor_leave_conflicts() – handle approved leave
-- 7. appointment_valid_transition() – state machine helper
-- ============================================================

BEGIN;

-- ============================================================
-- 1. expire_stale_holds()
-- Mark ACTIVE holds whose expires_at < now as EXPIRED.
-- Release their associated slots back to AVAILABLE (only
-- if they were still HELD — not already BOOKED).
-- Safe to call repeatedly; idempotent.
-- ============================================================
CREATE OR REPLACE FUNCTION public.expire_stale_holds()
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  _expired_count INTEGER;
BEGIN
  -- Lock deterministically to avoid deadlocks
  LOCK TABLE public.slot_holds IN ROW EXCLUSIVE MODE;
  LOCK TABLE public.appointment_slots IN ROW EXCLUSIVE MODE;

  -- 1. Consume holds that are stale and still ACTIVE
  WITH expired_holds AS (
    UPDATE public.slot_holds
       SET status = 'EXPIRED',
           released_at = NOW()
     WHERE status = 'ACTIVE'
       AND expires_at < NOW()
     RETURNING hold_id, slot_id
  )
  -- 2. Release corresponding slots back to AVAILABLE
  UPDATE public.appointment_slots s
     SET status = 'AVAILABLE'
    FROM expired_holds e
   WHERE s.slot_id = e.slot_id
     AND s.status = 'HELD';

  GET DIAGNOSTICS _expired_count = ROW_COUNT;
  RETURN _expired_count;
END;
$$;

-- ============================================================
-- 2. atomic_hold_slot()
--   p_doctor_id       — bigint
--   p_slot_id         — bigint
--   p_patient_id      — bigint
--   p_hold_duration_s — integer seconds (default 300 = 5 min)
--   p_allow_expire    — bool (default true → auto-expire stale before attempt)
--
-- Steps:
--   • Advisory lock on slot_id (per-slot serialisation)
--   • Expire any stale hold on that slot (inlined)
--   • Verify slot status = 'AVAILABLE'
--   • Verify slot doctor_id matches
--   • Verify no doctor leave on that date
--   • UPDATE slot → 'HELD'
--   • INSERT slot_holds → 'ACTIVE' with generated UUID token
--   • RETURN (hold_id, hold_token, expires_at, slot_id) 1 row
--     OR raise exception with SQLSTATE for client handling.
--
--   SQLSTATE codes used:
--     P0S01 = SLOT_NOT_AVAILABLE
--     P0S02 = SLOT_DOCTOR_MISMATCH
--     P0S03 = DOCTOR_ON_LEAVE
--     P0S04 = SLOT_IN_PAST
-- ============================================================
CREATE OR REPLACE FUNCTION public.atomic_hold_slot(
  p_doctor_id       BIGINT,
  p_slot_id         BIGINT,
  p_patient_id      BIGINT,
  p_hold_duration_s INTEGER DEFAULT 300,
  p_allow_expire    BOOLEAN DEFAULT TRUE
)
RETURNS TABLE (
  hold_id    BIGINT,
  hold_token UUID,
  expires_at TIMESTAMPTZ,
  slot_id    BIGINT,
  start_time TIMESTAMPTZ,
  end_time   TIMESTAMPTZ
)
LANGUAGE plpgsql
AS $$
DECLARE
  _lock_key      BIGINT;
  _slot          RECORD;
  _hold_token    UUID    := gen_random_uuid();
  _expires_at    TIMESTAMPTZ := NOW() + (p_hold_duration_s || ' seconds')::INTERVAL;
  _new_hold_id   BIGINT;
  _on_leave      BOOLEAN;
BEGIN
  IF p_hold_duration_s <= 0 THEN
    RAISE EXCEPTION 'hold duration must be positive' USING ERRCODE = '22000';
  END IF;

  -- Advisory lock scoped to slot id. Use hash to spread across int64 range.
  _lock_key := ('x' || substr(md5('slot_' || p_slot_id::TEXT), 1, 16))::BIT(64)::BIGINT;
  PERFORM pg_advisory_xact_lock(_lock_key);

  -- Inline expiry for this specific slot (avoid calling outer function in tx — no double-lock)
  IF p_allow_expire THEN
    UPDATE public.slot_holds
       SET status = 'EXPIRED',
           released_at = NOW()
     WHERE slot_holds.slot_id = p_slot_id
       AND status = 'ACTIVE'
       AND expires_at < NOW();

    UPDATE public.appointment_slots s
       SET status = 'AVAILABLE'
     WHERE s.slot_id = p_slot_id
       AND s.status = 'HELD'
       AND NOT EXISTS (
         SELECT 1 FROM public.slot_holds h
          WHERE h.slot_id = s.slot_id AND h.status = 'ACTIVE'
       );
  END IF;

  -- Fetch + lock the slot row
  SELECT * INTO STRICT _slot
    FROM public.appointment_slots s
   WHERE s.slot_id = p_slot_id
   FOR UPDATE;

  -- Basic invariants
  IF _slot.doctor_id <> p_doctor_id THEN
    RAISE EXCEPTION 'slot does not belong to doctor' USING ERRCODE = 'P0S02';
  END IF;

  IF _slot.start_time <= NOW() THEN
    RAISE EXCEPTION 'slot is in the past' USING ERRCODE = 'P0S04';
  END IF;

  IF _slot.status <> 'AVAILABLE' THEN
    RAISE EXCEPTION 'slot is not available' USING ERRCODE = 'P0S01';
  END IF;

  -- Check doctor leave (APPROVED or PENDING) covers the slot date
  SELECT EXISTS (
    SELECT 1 FROM public.doctor_leave l
     WHERE l.doctor_id = p_doctor_id
       AND l.status IN ('PENDING','APPROVED')
       AND _slot.start_time::DATE BETWEEN l.start_date AND l.end_date
  ) INTO _on_leave;

  IF _on_leave THEN
    RAISE EXCEPTION 'doctor is on leave for this date' USING ERRCODE = 'P0S03';
  END IF;

  -- Mark slot as HELD
  UPDATE public.appointment_slots s
     SET status = 'HELD'
   WHERE s.slot_id = p_slot_id;

  -- Persist the hold
  INSERT INTO public.slot_holds (
    slot_id, patient_id, hold_token, held_at, expires_at, status
  ) VALUES (
    p_slot_id, p_patient_id, _hold_token, NOW(), _expires_at, 'ACTIVE'
  ) RETURNING slot_holds.hold_id INTO _new_hold_id;

  RETURN QUERY
    SELECT _new_hold_id, _hold_token, _expires_at, _slot.slot_id, _slot.start_time, _slot.end_time;
END;
$$;

-- ============================================================
-- 3. atomic_release_hold()
--   p_hold_token UUID
--   p_patient_id BIGINT (ownership check)
-- Release hold → RELEASED, and slot → AVAILABLE (if still HELD).
-- ============================================================
CREATE OR REPLACE FUNCTION public.atomic_release_hold(
  p_hold_token UUID,
  p_patient_id BIGINT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
DECLARE
  _hold     RECORD;
  _lock_key BIGINT;
BEGIN
  SELECT * INTO _hold
    FROM public.slot_holds h
   WHERE h.hold_token = p_hold_token
   FOR UPDATE;

  IF NOT FOUND THEN RETURN FALSE; END IF;
  IF _hold.patient_id <> p_patient_id THEN RETURN FALSE; END IF;
  IF _hold.status <> 'ACTIVE' THEN RETURN FALSE; END IF;

  _lock_key := ('x' || substr(md5('slot_' || _hold.slot_id::TEXT), 1, 16))::BIT(64)::BIGINT;
  PERFORM pg_advisory_xact_lock(_lock_key);

  UPDATE public.slot_holds h
     SET status = 'RELEASED', released_at = NOW()
   WHERE h.hold_id = _hold.hold_id;

  UPDATE public.appointment_slots s
     SET status = 'AVAILABLE'
   WHERE s.slot_id = _hold.slot_id
     AND s.status = 'HELD';

  RETURN TRUE;
END;
$$;

-- ============================================================
-- 4. atomic_confirm_booking()
--   p_hold_token    UUID
--   p_patient_id    BIGINT
--   p_reason        TEXT (nullable)
--   p_timezone      TEXT (default 'UTC')
--   p_idempotency   TEXT (nullable) — unique per booking intent
--   p_booked_by     UUID (nullable auth.uid)
--
-- Steps (serialised per slot via advisory lock):
--   • Expire stale holds inline
--   • Load hold; check ownership, ACTIVE, not expired
--   • Load slot (doctor_id, start_time, end_time); ensure HELD
--   • Check idempotency → if already present return same record
--   • slot → BOOKED
--   • hold → CONSUMED
--   • INSERT appointment (status=CONFIRMED)
--   • Return appointment id + slot id + status
--
-- SQLSTATE:
--   P0B01 = INVALID_HOLD
--   P0B02 = HOLD_NOT_OWNED
--   P0B03 = HOLD_EXPIRED
--   P0B04 = SLOT_NOT_HELD
--   P0B05 = IDEMPOTENT_DUPLICATE
-- ============================================================
CREATE OR REPLACE FUNCTION public.atomic_confirm_booking(
  p_hold_token  UUID,
  p_patient_id  BIGINT,
  p_reason      TEXT   DEFAULT NULL,
  p_timezone    TEXT   DEFAULT 'UTC',
  p_idempotency TEXT   DEFAULT NULL,
  p_booked_by   UUID   DEFAULT NULL
)
RETURNS TABLE (
  appointment_id BIGINT,
  slot_id        BIGINT,
  doctor_id      BIGINT,
  patient_id     BIGINT,
  status         appointment_status,
  is_idempotent  BOOLEAN
)
LANGUAGE plpgsql
AS $$
DECLARE
  _hold         RECORD;
  _slot         RECORD;
  _lock_key     BIGINT;
  _appt_id      BIGINT;
  _idempotent   BOOLEAN := FALSE;
BEGIN
  -- Idempotency short-circuit
  IF p_idempotency IS NOT NULL THEN
    SELECT a.appointment_id INTO _appt_id
      FROM public.appointments a
     WHERE a.idempotency_key = p_idempotency;
    IF FOUND THEN
      RETURN QUERY
        SELECT a.appointment_id, a.slot_id, a.doctor_id, a.patient_id, a.status, TRUE
          FROM public.appointments a WHERE a.appointment_id = _appt_id;
      RETURN;
    END IF;
  END IF;

  -- Lock hold row
  SELECT * INTO _hold
    FROM public.slot_holds h
   WHERE h.hold_token = p_hold_token
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invalid hold token' USING ERRCODE = 'P0B01';
  END IF;

  IF _hold.patient_id <> p_patient_id THEN
    RAISE EXCEPTION 'hold does not belong to patient' USING ERRCODE = 'P0B02';
  END IF;

  IF _hold.status <> 'ACTIVE' THEN
    IF _hold.status = 'EXPIRED' THEN
      RAISE EXCEPTION 'hold expired' USING ERRCODE = 'P0B03';
    END IF;
    RAISE EXCEPTION 'hold is not active' USING ERRCODE = 'P0B01';
  END IF;

  -- Expire hold if passed (edge case)
  IF _hold.expires_at < NOW() THEN
    UPDATE public.slot_holds h SET status = 'EXPIRED', released_at = NOW()
     WHERE h.hold_id = _hold.hold_id;
    RAISE EXCEPTION 'hold expired' USING ERRCODE = 'P0B03';
  END IF;

  _lock_key := ('x' || substr(md5('slot_' || _hold.slot_id::TEXT), 1, 16))::BIT(64)::BIGINT;
  PERFORM pg_advisory_xact_lock(_lock_key);

  -- Re-check idempotency after acquiring lock (another concurrent caller could have inserted)
  IF p_idempotency IS NOT NULL THEN
    SELECT a.appointment_id INTO _appt_id
      FROM public.appointments a
     WHERE a.idempotency_key = p_idempotency;
    IF FOUND THEN
      -- release our hold, it was a race
      UPDATE public.slot_holds h SET status = 'RELEASED', released_at = NOW()
       WHERE h.hold_id = _hold.hold_id;
      RETURN QUERY
        SELECT a.appointment_id, a.slot_id, a.doctor_id, a.patient_id, a.status, TRUE
          FROM public.appointments a WHERE a.appointment_id = _appt_id;
      RETURN;
    END IF;
  END IF;

  -- Lock the slot
  SELECT * INTO STRICT _slot
    FROM public.appointment_slots s
   WHERE s.slot_id = _hold.slot_id
   FOR UPDATE;

  IF _slot.status <> 'HELD' THEN
    RAISE EXCEPTION 'slot is not held' USING ERRCODE = 'P0B04';
  END IF;

  -- Confirm slot BOOKED
  UPDATE public.appointment_slots s
     SET status = 'BOOKED'
   WHERE s.slot_id = _slot.slot_id;

  -- Consume hold
  UPDATE public.slot_holds h
     SET status = 'CONSUMED',
         released_at = NOW()
   WHERE h.hold_id = _hold.hold_id;

  -- Create appointment
  INSERT INTO public.appointments (
    slot_id,
    patient_id,
    doctor_id,
    status,
    reason_for_visit,
    booked_at,
    booked_by_user_id,
    confirmed_at,
    timezone,
    idempotency_key
  ) VALUES (
    _slot.slot_id,
    p_patient_id,
    _slot.doctor_id,
    'CONFIRMED',
    p_reason,
    NOW(),
    p_booked_by,
    NOW(),
    COALESCE(p_timezone,'UTC'),
    p_idempotency
  ) RETURNING appointments.appointment_id INTO _appt_id;

  RETURN QUERY
    SELECT a.appointment_id, a.slot_id, a.doctor_id, a.patient_id, a.status, _idempotent
      FROM public.appointments a
     WHERE a.appointment_id = _appt_id;
END;
$$;

-- ============================================================
-- 5. appointment_valid_transition()
-- Returns TRUE if transition is permitted.
-- Also used server-side before update (in application service).
-- Optionally enforced in DB via trigger below.
-- ============================================================
CREATE OR REPLACE FUNCTION public.appointment_valid_transition(
  p_from appointment_status,
  p_to   appointment_status
)
RETURNS BOOLEAN
LANGUAGE plpgsql IMMUTABLE
AS $$
BEGIN
  RETURN CASE
    WHEN p_from = p_to THEN TRUE
    WHEN p_from = 'HELD' THEN p_to IN ('CONFIRMED','CANCELLED')
    WHEN p_from = 'CONFIRMED' THEN p_to IN ('COMPLETED','CANCELLED','RESCHEDULE_REQUIRED','DOCTOR_LEAVE_CONFLICT')
    WHEN p_from = 'RESCHEDULE_REQUIRED' THEN p_to IN ('CONFIRMED','CANCELLED')
    WHEN p_from = 'DOCTOR_LEAVE_CONFLICT' THEN p_to IN ('RESCHEDULE_REQUIRED','CANCELLED','CONFIRMED')
    ELSE FALSE
  END;
END;
$$;

-- Trigger: prevent invalid state transitions on appointments table
CREATE OR REPLACE FUNCTION public.appointments_check_transition()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    IF NOT public.appointment_valid_transition(OLD.status, NEW.status) THEN
      RAISE EXCEPTION 'invalid appointment state transition: % → %', OLD.status, NEW.status
        USING ERRCODE = 'P0T01';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS appointments_check_transition_trg ON public.appointments;
CREATE TRIGGER appointments_check_transition_trg
  BEFORE UPDATE OF status ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.appointments_check_transition();

-- ============================================================
-- 6. cancel_appointment()
--   p_appointment_id BIGINT
--   p_patient_id     BIGINT OR NULL  (NULL = admin/doctor override allowed via caller)
--   p_caller_user_id UUID (nullable, caller id)
--   p_caller_role    TEXT ('Admin','Doctor','Patient')
--   p_reason         cancel_reason_type
--   p_reason_text    TEXT
--
-- Returns BOOLEAN success.
-- ============================================================
CREATE OR REPLACE FUNCTION public.cancel_appointment(
  p_appointment_id BIGINT,
  p_patient_id     BIGINT,
  p_caller_user_id UUID,
  p_caller_role    TEXT,
  p_reason         cancel_reason_type,
  p_reason_text    TEXT DEFAULT NULL
)
RETURNS TABLE (
  success        BOOLEAN,
  appointment_id BIGINT,
  old_status     appointment_status,
  new_status     appointment_status,
  slot_freed     BOOLEAN
)
LANGUAGE plpgsql
AS $$
DECLARE
  _appt      RECORD;
  _old       appointment_status;
  _is_owner  BOOLEAN;
  _slot_freed BOOLEAN := FALSE;
  _lock_key   BIGINT;
BEGIN
  SELECT * INTO _appt
    FROM public.appointments a
   WHERE a.appointment_id = p_appointment_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, NULL::BIGINT, NULL, NULL, FALSE;
    RETURN;
  END IF;

  _old := _appt.status;

  -- Already cancelled? short-circuit idempotent
  IF _appt.status = 'CANCELLED' THEN
    RETURN QUERY SELECT TRUE, _appt.appointment_id, _old, _appt.status, FALSE;
    RETURN;
  END IF;

  -- Completed cannot be cancelled
  IF _appt.status = 'COMPLETED' THEN
    RETURN QUERY SELECT FALSE, _appt.appointment_id, _old, _appt.status, FALSE;
    RETURN;
  END IF;

  -- Ownership / role check
  _is_owner := FALSE;
  IF p_caller_role = 'Patient' THEN
    _is_owner := (_appt.patient_id = p_patient_id);
  ELSIF p_caller_role = 'Doctor' THEN
    -- check caller's staff id = doctor_id via lookup done at call site; we accept by param presence
    -- caller must ensure the Doctor owns this appointment. We re-check by user id below.
    _is_owner := EXISTS (
      SELECT 1 FROM public.medical_staff ms
       WHERE ms.user_id = p_caller_user_id AND ms.staff_id = _appt.doctor_id
    );
  ELSIF p_caller_role = 'Admin' THEN
    _is_owner := TRUE;
  END IF;

  IF NOT _is_owner THEN
    RETURN QUERY SELECT FALSE, _appt.appointment_id, _old, _appt.status, FALSE;
    RETURN;
  END IF;

  -- Serialise on slot
  IF _appt.slot_id IS NOT NULL THEN
    _lock_key := ('x' || substr(md5('slot_' || _appt.slot_id::TEXT), 1, 16))::BIT(64)::BIGINT;
    PERFORM pg_advisory_xact_lock(_lock_key);

    -- Release the slot if still BOOKED / HELD
    UPDATE public.appointment_slots s
       SET status = 'AVAILABLE'
     WHERE s.slot_id = _appt.slot_id
       AND s.status IN ('BOOKED','HELD');

    IF FOUND THEN _slot_freed := TRUE; END IF;
  END IF;

  -- Perform transition (state-machine trigger enforces it)
  UPDATE public.appointments a
     SET status        = 'CANCELLED',
         cancelled_at  = NOW(),
         cancel_reason = p_reason,
         cancel_reason_text = p_reason_text
   WHERE a.appointment_id = _appt.appointment_id;

  RETURN QUERY
    SELECT TRUE, _appt.appointment_id, _old, 'CANCELLED', _slot_freed;
END;
$$;

-- ============================================================
-- 7. process_doctor_leave_conflicts()
-- Called when a doctor leave record is created (or approved).
--   p_doctor_id BIGINT
--   p_start_date DATE
--   p_end_date   DATE
--
-- Effects:
--   • Mark all AVAILABLE slots in that date range as BLOCKED
--   • Release ACTIVE holds on those slots (and their slot → AVAILABLE → BLOCKED)
--   • Mark CONFIRMED appointments during that window → DOCTOR_LEAVE_CONFLICT
--
-- Returns counts: {slots_blocked, holds_released, appointments_conflicted}
--
-- Does NOT delete appointments. The admin/patient must reschedule.
-- ============================================================
CREATE OR REPLACE FUNCTION public.process_doctor_leave_conflicts(
  p_doctor_id  BIGINT,
  p_start_date DATE,
  p_end_date   DATE
)
RETURNS TABLE (
  slots_blocked          INTEGER,
  holds_released         INTEGER,
  appointments_conflicted INTEGER
)
LANGUAGE plpgsql
AS $$
DECLARE
  _s_blocked   INTEGER := 0;
  _h_released  INTEGER := 0;
  _a_conflict  INTEGER := 0;
BEGIN
  IF p_start_date > p_end_date THEN
    RAISE EXCEPTION 'start_date must be <= end_date' USING ERRCODE = '22000';
  END IF;

  -- Release ACTIVE holds on affected slots (blocks them from booking first)
  WITH affected AS (
    SELECT s.slot_id
      FROM public.appointment_slots s
     WHERE s.doctor_id = p_doctor_id
       AND s.start_time::DATE BETWEEN p_start_date AND p_end_date
  ),
  released_holds AS (
    UPDATE public.slot_holds h
       SET status = 'EXPIRED',
           released_at = NOW()
      FROM affected a
     WHERE h.slot_id = a.slot_id AND h.status = 'ACTIVE'
     RETURNING 1
  )
  SELECT COUNT(*) INTO _h_released FROM released_holds;

  -- Block available / held slots within the window
  WITH updated_slots AS (
    UPDATE public.appointment_slots s
       SET status = 'BLOCKED'
     WHERE s.doctor_id = p_doctor_id
       AND s.start_time::DATE BETWEEN p_start_date AND p_end_date
       AND s.status IN ('AVAILABLE','HELD')
     RETURNING 1
  )
  SELECT COUNT(*) INTO _s_blocked FROM updated_slots;

  -- Mark CONFIRMED appointments as DOCTOR_LEAVE_CONFLICT
  WITH appts AS (
    UPDATE public.appointments a
       SET status = 'DOCTOR_LEAVE_CONFLICT'
     WHERE a.doctor_id = p_doctor_id
       AND a.status = 'CONFIRMED'
       AND a.slot_id IN (
         SELECT s.slot_id FROM public.appointment_slots s
          WHERE s.doctor_id = p_doctor_id
            AND s.start_time::DATE BETWEEN p_start_date AND p_end_date
       )
     RETURNING 1
  )
  SELECT COUNT(*) INTO _a_conflict FROM appts;

  RETURN QUERY SELECT _s_blocked, _h_released, _a_conflict;
END;
$$;

-- ============================================================
-- 8. generate_doctor_slots() — convenience RPC
--   p_doctor_id    BIGINT
--   p_from_date    DATE
--   p_to_date      DATE
--   p_force_rebuild BOOLEAN (FALSE = skip days that already have slots;
--                            TRUE = delete AVAILABLE slots and re-generate)
-- This function only INSERTs; does not conflict with bookings because
-- UNIQUE index catches duplicates and we handle them.
-- Returns count of slots inserted.
-- Note: The service layer in TypeScript is the canonical generator; this
-- RPC is available for SQL/tests/admin usage.
-- ============================================================
CREATE OR REPLACE FUNCTION public.generate_doctor_slots(
  p_doctor_id    BIGINT,
  p_from_date    DATE,
  p_to_date      DATE,
  p_force_rebuild BOOLEAN DEFAULT FALSE
)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  _inserted      INTEGER := 0;
  _avail         RECORD;
  _date          DATE;
  _dow           INTEGER;
  _start_dt      TIMESTAMPTZ;
  _end_dt        TIMESTAMPTZ;
  _slot_end      TIMESTAMPTZ;
  _duration      SMALLINT;
  _cursor        TIMESTAMPTZ;
  _valid_until   DATE;
  _valid_from    DATE;
  _on_leave      BOOLEAN;
BEGIN
  IF p_from_date > p_to_date THEN
    RAISE EXCEPTION 'from_date must be <= to_date' USING ERRCODE = '22000';
  END IF;

  -- Optional: delete existing AVAILABLE slots in range (force rebuild)
  IF p_force_rebuild THEN
    DELETE FROM public.appointment_slots s
     WHERE s.doctor_id = p_doctor_id
       AND s.status = 'AVAILABLE'
       AND s.start_time::DATE BETWEEN p_from_date AND p_to_date;
  END IF;

  FOR _avail IN
    SELECT * FROM public.doctor_availability a
     WHERE a.doctor_id = p_doctor_id AND a.active = TRUE
  LOOP
    _duration := _avail.slot_duration_minutes;
    _valid_from := COALESCE(_avail.valid_from, p_from_date);
    _valid_until  := COALESCE(_avail.valid_until, p_to_date);

    _date := GREATEST(p_from_date, _valid_from);
    WHILE _date <= LEAST(p_to_date, _valid_until) LOOP
      _dow := EXTRACT(ISODOW FROM _date)::INTEGER;
      -- ISODOW: Mon=1..Sun=7; we store day_of_week Sun=0..Sat=6 per JS convention
      -- Convert: if _dow=7 → 0 else keep
      IF _dow = 7 THEN _dow := 0; END IF;

      IF _dow = _avail.day_of_week THEN
        -- Skip leave dates
        SELECT EXISTS (
          SELECT 1 FROM public.doctor_leave l
           WHERE l.doctor_id = p_doctor_id
             AND l.status IN ('PENDING','APPROVED')
             AND _date BETWEEN l.start_date AND l.end_date
        ) INTO _on_leave;

        IF NOT _on_leave THEN
          _start_dt := (_date::TIMESTAMP AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' + _avail.start_time;
          _end_dt   := (_date::TIMESTAMP AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' + _avail.end_time;

          _cursor := _start_dt;
          WHILE _cursor + (_duration || ' minutes')::INTERVAL <= _end_dt LOOP
            _slot_end := _cursor + (_duration || ' minutes')::INTERVAL;

            INSERT INTO public.appointment_slots (
              doctor_id, start_time, end_time, duration_minutes, status
            ) VALUES (
              p_doctor_id, _cursor, _slot_end, _duration, 'AVAILABLE'
            )
            ON CONFLICT (doctor_id, start_time) WHERE status IN ('AVAILABLE','HELD','BOOKED') DO NOTHING;

            IF FOUND THEN _inserted := _inserted + 1; END IF;

            _cursor := _slot_end;
          END LOOP;
        END IF;
      END IF;
      _date := _date + 1;
    END LOOP;
  END LOOP;

  RETURN _inserted;
END;
$$;

COMMIT;
