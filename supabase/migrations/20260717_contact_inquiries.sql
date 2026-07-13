-- =============================================================================
-- CONTACT INQUIRIES (public contact-form submissions → platform admin inbox)
-- =============================================================================
-- The public marketing /contact form writes a row here. Submissions are read and
-- managed by the PLATFORM admin only, in the Admin Console "Inquiries" page.
--
-- All access goes through server actions that use the SERVICE-ROLE client:
--   • public submit  -> lib/actions/contact.ts submitInquiryAction (insert)
--   • admin manage    -> setInquiryStatusAction / deleteInquiryAction
-- The service role bypasses RLS, so RLS is enabled with NO policies: normal
-- (anon / authenticated) clients get zero access to the table. This keeps
-- inquiries — which contain personal contact details — locked down by default.
--
-- Safe to run once. Idempotent.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. contact_inquiries table
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS contact_inquiries (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  email       TEXT NOT NULL,
  phone       TEXT,
  -- Company / fleet name the sender typed (optional).
  company     TEXT,
  -- Free-text fleet-size band, e.g. '1-5', '6-15', '16-50', '50+'.
  fleet_size  TEXT,
  -- What the inquiry is about: sales | support | partnership | other.
  topic       TEXT NOT NULL DEFAULT 'sales',
  message     TEXT NOT NULL,
  -- Workflow state as the admin triages: new | read | replied | archived.
  status      TEXT NOT NULL DEFAULT 'new'
              CHECK (status IN ('new', 'read', 'replied', 'archived')),
  -- Where it came from (future-proofing for other embedded forms).
  source      TEXT NOT NULL DEFAULT 'contact_page',
  page_path   TEXT,
  user_agent  TEXT,
  -- Which platform admin last actioned it, and when.
  handled_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  handled_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contact_inquiries_status     ON contact_inquiries(status);
CREATE INDEX IF NOT EXISTS idx_contact_inquiries_created_at ON contact_inquiries(created_at DESC);

-- -----------------------------------------------------------------------------
-- 2. RLS — locked down. Only the service-role client (used by the server
--    actions) can touch these rows; anon/authenticated get nothing.
-- -----------------------------------------------------------------------------
ALTER TABLE contact_inquiries ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- 3. updated_at trigger
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_contact_inquiries_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_contact_inquiries_updated_at ON contact_inquiries;
CREATE TRIGGER trigger_contact_inquiries_updated_at
  BEFORE UPDATE ON contact_inquiries
  FOR EACH ROW
  EXECUTE FUNCTION update_contact_inquiries_updated_at();

-- -----------------------------------------------------------------------------
-- 4. Documentation
-- -----------------------------------------------------------------------------
COMMENT ON TABLE contact_inquiries IS 'Public /contact form submissions. Read & managed by the platform admin only, via service-role server actions (RLS enabled, no policies = no anon/authenticated access).';
COMMENT ON COLUMN contact_inquiries.status IS 'Triage state: new | read | replied | archived.';
COMMENT ON COLUMN contact_inquiries.topic IS 'Inquiry subject: sales | support | partnership | other.';

SELECT 'Contact inquiries installed.' AS message;
