-- =============================================================================
-- PLATFORM NOTIFICATIONS — cross-tenant broadcasts from the SaaS operator
-- =============================================================================
-- The platform admin (Frank / "Rovora HQ") can now send notifications to any
-- fleet operator (their clients) or any driver, across tenants. We reuse the
-- existing per-tenant `notifications` table — every recipient still reads it
-- through their normal RLS (own driver rows or org broadcasts) — and just tag
-- where a notification came FROM so the recipient can see the sender.
--
-- Platform sends are written by trusted server code on the service-role client
-- (lib/actions/platform-notifications.ts), which stamps organization_id per
-- target org explicitly (the auto-stamp trigger only fills NULLs and never
-- overwrites an explicit value).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- notifications: where did this come from + a display label for the sender.
-- -----------------------------------------------------------------------------
ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'fleet'
    CHECK (source IN ('fleet', 'platform'));
ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS sender_label text;   -- e.g. 'Rovora HQ' for platform sends

-- -----------------------------------------------------------------------------
-- platform_broadcasts: an audit/history row per platform send (NOT tenant-
-- scoped — it belongs to the platform). One row summarises a fan-out that may
-- have created many per-org / per-driver notifications.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS platform_broadcasts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title           text NOT NULL,
  body            text NOT NULL,
  action_url      text,
  channels        text[] NOT NULL DEFAULT '{}',   -- subset of {app,push,email}
  audience_type   text NOT NULL,                   -- 'operators' | 'drivers'
  audience_scope  text NOT NULL,                   -- 'all' | 'operators' | 'plan' | 'drivers'
  target_summary  text,                            -- human-readable audience description
  recipient_count integer NOT NULL DEFAULT 0,
  results         jsonb,                           -- { app:{sent,failed}, push:{...}, email:{...} }
  sent_by         uuid,                            -- platform admin user id
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_platform_broadcasts_created_at ON platform_broadcasts(created_at DESC);

ALTER TABLE platform_broadcasts ENABLE ROW LEVEL SECURITY;

-- Only platform admins can read/write (real writes go through the service-role
-- action; this is defense in depth + lets an admin read history under RLS too).
DROP POLICY IF EXISTS "Platform admins manage broadcasts" ON platform_broadcasts;
CREATE POLICY "Platform admins manage broadcasts"
  ON platform_broadcasts FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM platform_admins pa WHERE pa.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM platform_admins pa WHERE pa.user_id = auth.uid()));

SELECT 'Platform notifications installed.' AS message;
