-- ============================================================
-- PHASE 5 — NOTIFICATIONS: dedupe key + medication reminder FKs
-- Timestamp: 20260821090000
-- ============================================================

BEGIN;

-- ------- 1. Add dedupe_key column to notifications for idempotent sends -------
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS dedupe_key TEXT;

-- Partial unique index: only enforce uniqueness when dedupe_key is provided.
-- This keeps legacy rows (no dedupe_key) unaffected while preventing true
-- duplicate sends for events that generate a deterministic key.
CREATE UNIQUE INDEX IF NOT EXISTS notifications_dedupe_key_uniq
  ON public.notifications(dedupe_key)
  WHERE dedupe_key IS NOT NULL;

-- Index for faster lookups by dedupe_key (also backs the unique constraint)
CREATE INDEX IF NOT EXISTS notifications_dedupe_idx
  ON public.notifications(dedupe_key);

COMMIT;
