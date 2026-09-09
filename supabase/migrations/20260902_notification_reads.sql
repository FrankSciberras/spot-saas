-- =============================================================================
-- PER-USER READ STATE FOR BROADCAST NOTIFICATIONS
-- =============================================================================
-- A broadcast notification (driver_id IS NULL, targeted at admins/staff or at
-- all drivers) is ONE row shared by everyone it addresses, and it had ONE
-- read_at column. The first admin to click "mark read" cleared it for every
-- other admin, so alerts vanished from colleagues' inboxes before they saw them.
--
-- notification_reads records who has read which broadcast. The API resolves a
-- viewer's read state from this table for broadcasts, and keeps using the row's
-- own read_at for driver-addressed notifications (those are per driver anyway).
-- =============================================================================

CREATE TABLE IF NOT EXISTS notification_reads (
  notification_id uuid NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  read_at         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (notification_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_notification_reads_user ON notification_reads(user_id);

ALTER TABLE notification_reads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users see own notification reads" ON notification_reads;
CREATE POLICY "Users see own notification reads"
  ON notification_reads FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users record own notification reads" ON notification_reads;
CREATE POLICY "Users record own notification reads"
  ON notification_reads FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users clear own notification reads" ON notification_reads;
CREATE POLICY "Users clear own notification reads"
  ON notification_reads FOR DELETE TO authenticated
  USING (user_id = auth.uid());

SELECT 'notification_reads: per-user read state for broadcasts' AS message;
