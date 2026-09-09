-- =============================================================================
-- SHIFT LIFECYCLE: closing odometer + photos, one open shift per driver,
-- forgotten-shift nudges / auto-close bookkeeping
-- =============================================================================
-- Until now a shift only recorded its START (odometer + photos); ending it just
-- stamped end_time. A driver could also open a second shift on top of an open
-- one, and nothing ever noticed a shift left open for days.
--
--   ending_mileage        closing odometer reading (>= starting_mileage)
--   end_image_urls        optional closing photos (shift-images bucket paths)
--   auto_closed_at        set when the hourly cron closed the shift itself
--   long_shift_nudged_at  set when the driver was reminded to clock out
--
-- The partial unique index makes "one open shift per driver" a database rule,
-- not just a UI check. Stray duplicates are closed first (newest kept; the
-- older one is ended at the moment the newer one began) so the index can build.
-- =============================================================================

ALTER TABLE driver_shifts
  ADD COLUMN IF NOT EXISTS ending_mileage INTEGER,
  ADD COLUMN IF NOT EXISTS end_image_urls TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS auto_closed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS long_shift_nudged_at TIMESTAMPTZ;

-- Close duplicate open shifts: for each driver keep only the most recent open
-- shift; every older open shift is ended when the next one started.
WITH ranked AS (
  SELECT
    id,
    start_time,
    LEAD(start_time) OVER (PARTITION BY driver_id ORDER BY start_time) AS next_start,
    ROW_NUMBER() OVER (PARTITION BY driver_id ORDER BY start_time DESC) AS rn
  FROM driver_shifts
  WHERE end_time IS NULL
)
UPDATE driver_shifts s
SET end_time = GREATEST(r.next_start, s.start_time),
    auto_closed_at = NOW()
FROM ranked r
WHERE r.id = s.id
  AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS driver_shifts_one_open_per_driver
  ON driver_shifts (driver_id)
  WHERE end_time IS NULL;

-- The hourly open-shift watch scans open shifts by age.
CREATE INDEX IF NOT EXISTS idx_driver_shifts_open_start
  ON driver_shifts (start_time)
  WHERE end_time IS NULL;

SELECT 'driver_shifts: closing odometer/photos + one-open-shift rule applied' AS message;
