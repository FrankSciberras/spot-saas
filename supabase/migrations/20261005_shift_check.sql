-- =============================================================================
-- "STILL ON SHIFT?" CHECK — per-fleet, replaces the fixed 14 h nudge / 24 h close
-- =============================================================================
-- After `shift_check_after_hours` on shift (counted from the start, or from the
-- driver's last "yes"), Rovora asks the driver whether they're still working.
-- Opening the Rovora Driver app answers it (driver_shifts.last_confirmed_at)
-- and the clock restarts. No answer within `shift_check_grace_minutes` → the
-- shift ends at the moment we asked, auto_close_reason = 'no_response', and
-- the fleet is told. Fleets that switch the check off keep the old 24 h
-- safety close. Logic: lib/shifts/shift-check.ts (runs every minute).
-- Safe to re-run.
-- =============================================================================

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS shift_check_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS shift_check_after_hours NUMERIC(4, 1) NOT NULL DEFAULT 12,
  ADD COLUMN IF NOT EXISTS shift_check_grace_minutes INTEGER NOT NULL DEFAULT 30;

ALTER TABLE public.organizations DROP CONSTRAINT IF EXISTS organizations_shift_check_after_hours_range;
ALTER TABLE public.organizations
  ADD CONSTRAINT organizations_shift_check_after_hours_range
  CHECK (shift_check_after_hours BETWEEN 1 AND 23);

ALTER TABLE public.organizations DROP CONSTRAINT IF EXISTS organizations_shift_check_grace_range;
ALTER TABLE public.organizations
  ADD CONSTRAINT organizations_shift_check_grace_range
  CHECK (shift_check_grace_minutes BETWEEN 15 AND 240);

ALTER TABLE public.driver_shifts
  ADD COLUMN IF NOT EXISTS check_requested_at TIMESTAMPTZ,   -- when we asked
  ADD COLUMN IF NOT EXISTS check_deadline_at  TIMESTAMPTZ,   -- ends then if no answer
  ADD COLUMN IF NOT EXISTS last_confirmed_at  TIMESTAMPTZ,   -- driver's last "still here"
  ADD COLUMN IF NOT EXISTS auto_close_reason  TEXT;          -- 'no_response' | 'max_duration'

-- The every-minute scan only ever looks at open shifts.
CREATE INDEX IF NOT EXISTS idx_driver_shifts_open
  ON public.driver_shifts (organization_id)
  WHERE end_time IS NULL;

SELECT 'Shift check installed.' AS message;
