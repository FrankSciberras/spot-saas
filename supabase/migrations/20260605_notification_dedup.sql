-- =============================================================================
-- NOTIFICATION DEDUP — make the automated rules engine safe to run repeatedly
-- =============================================================================
-- The rules engine (lib/notifications/engine.ts) sweeps active notification_rules
-- and creates notifications for matching facts (a document expiring within N
-- days, a shift starting within N hours, …). Without a memory of what it has
-- already sent, a daily run would re-send the same "license expires in 30 days"
-- alert every day. This table records a stable key per (org, rule, fact, window)
-- so each alert fires exactly once. Writes come from the service-role engine.
-- =============================================================================

CREATE TABLE IF NOT EXISTS notification_dedup (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  rule_id         uuid REFERENCES notification_rules(id) ON DELETE SET NULL,
  dedup_key       text NOT NULL,        -- e.g. 'docexp:driver:<id>:driving_license:2026-07-01'
  sent_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, dedup_key)
);

CREATE INDEX IF NOT EXISTS idx_notification_dedup_org ON notification_dedup(organization_id);

ALTER TABLE notification_dedup ENABLE ROW LEVEL SECURITY;

-- Org admins may read their own dedup history (debugging). Engine writes via the
-- service role, which bypasses RLS.
DROP POLICY IF EXISTS "Admins read notification dedup" ON notification_dedup;
CREATE POLICY "Admins read notification dedup"
  ON notification_dedup FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM memberships m
    WHERE m.organization_id = notification_dedup.organization_id
      AND m.user_id = auth.uid()
      AND m.role = 'admin'
  ));

SELECT 'Notification dedup installed.' AS message;
