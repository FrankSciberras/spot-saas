-- =============================================================================
-- LIFECYCLE EMAILS — one row per (user, fleet, kind) so automated check-ins are
-- sent exactly once. First kind: 'inactive_7d' (the "need any help?" nudge
-- sent when a fleet admin hasn't signed in for 7 days).
-- =============================================================================

CREATE TABLE IF NOT EXISTS lifecycle_emails (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind            text NOT NULL,
  sent_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, user_id, kind)
);

CREATE INDEX IF NOT EXISTS idx_lifecycle_emails_org ON lifecycle_emails(organization_id);

ALTER TABLE lifecycle_emails ENABLE ROW LEVEL SECURITY;
-- Written by the cron under the service role (bypasses RLS). Fleet admins may
-- read their own fleet's rows for support/debugging.
DROP POLICY IF EXISTS "Org admins read lifecycle emails" ON lifecycle_emails;
CREATE POLICY "Org admins read lifecycle emails"
  ON lifecycle_emails FOR SELECT TO authenticated
  USING (public.is_org_admin(organization_id));

SELECT 'lifecycle_emails ready' AS message;
