-- =============================================================================
-- XERO INTEGRATION — one-way push of invoices, credit notes, payments and
-- (optionally) bookkeeping lines into a fleet's own Xero organisation
-- =============================================================================
-- A fleet admin connects Xero by signing in to Xero and approving Rovora
-- (OAuth 2). From then on Rovora SENDS to Xero; it never pulls accounting data
-- back and never edits anything it did not create there.
--
--   * xero_connections — one row per connected fleet: which Xero organisation,
--                        the OAuth tokens (ENCRYPTED by the app before storage,
--                        see lib/crypto/secret-box.ts), the account/tax mapping
--                        the admin chose, and sync bookkeeping.
--   * xero_sync_items  — the sync ledger: one row per Rovora record that has
--                        been (or should be) sent, with the id it got in Xero,
--                        whether it worked, and the error if it did not. This
--                        is both what makes the sync idempotent — a record with
--                        a Xero id is never created twice — and the activity
--                        log the admin sees.
--
-- Rows in xero_sync_items are keyed by the Xero organisation (tenant) as well
-- as the fleet, and are kept when a fleet disconnects: reconnecting the same
-- Xero organisation carries on where it left off instead of sending everything
-- a second time, and connecting a different one starts clean.
--
-- SECURITY: both tables are SERVICE-ROLE ONLY (RLS on, no policies, grants
-- revoked). The app reads and writes them in server code that has already
-- checked the caller is an ADMIN of the active fleet.
--
-- Depends on 20261118_invoices.sql for what gets sent, but not for creating
-- these tables. IDEMPOTENT: re-runnable.
-- =============================================================================

CREATE TABLE IF NOT EXISTS xero_connections (
  organization_id    uuid PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  -- The Xero organisation.
  tenant_id          text NOT NULL,
  tenant_name        text,
  -- Xero's id for this app↔organisation link; needed to disconnect just this one.
  connection_id      text,
  org_base_currency  text,
  org_country        text,
  -- Used to build "open in Xero" links.
  org_short_code     text,
  -- OAuth tokens, AES-256-GCM encrypted by the app. Never stored in clear.
  access_token_enc   text NOT NULL,
  refresh_token_enc  text NOT NULL,
  access_expires_at  timestamptz NOT NULL,
  -- Bumped on every token refresh. Xero rotates the refresh token each time, so
  -- two processes refreshing at once must not overwrite each other: a refresh
  -- is saved only if the version is still the one it started from.
  token_version      integer NOT NULL DEFAULT 1,
  scopes             text,
  -- 'connected'       = working
  -- 'needs_reconnect' = Xero refused the tokens (access removed in Xero, or 60
  --                     days without a sync). The admin signs in to Xero again.
  status             text NOT NULL DEFAULT 'connected' CHECK (status IN ('connected', 'needs_reconnect')),
  last_error         text,
  -- The admin's choices: accounts, tax rates, what to send, from which date.
  -- Shape: XeroSettings in lib/xero/types.ts.
  settings           jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Set while a sync is running so two never overlap; a stale lock (crashed
  -- run) is ignored after ten minutes.
  sync_started_at    timestamptz,
  last_synced_at     timestamptz,
  connected_by       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE xero_connections ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON xero_connections FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS xero_sync_items (
  organization_id  uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  tenant_id        text NOT NULL,
  -- contact          = invoice_customers.id
  -- invoice          = invoices.id (kind invoice)
  -- credit_note      = invoices.id (kind credit_note)
  -- allocation       = invoice_credit_allocations.id
  -- payment          = invoice_payments.id (a payment on an invoice, or a refund on a credit note)
  -- bank_transaction = finance_transactions.id
  entity_type      text NOT NULL CHECK (entity_type IN
                     ('contact', 'invoice', 'credit_note', 'allocation', 'payment', 'bank_transaction')),
  entity_id        uuid NOT NULL,
  -- The id Xero gave it. Set = it exists in Xero; never create it again.
  xero_id          text,
  -- pending = not sent yet, or will be retried
  -- synced  = Xero matches Rovora
  -- error   = Xero refused it; last_error says why; retried on the next run
  -- skipped = deliberately not sent (e.g. voided before it was ever sent)
  status           text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'synced', 'error', 'skipped')),
  -- What Xero currently holds for it: active, or voided/deleted after the
  -- Rovora record was voided or removed.
  remote_state     text NOT NULL DEFAULT 'none' CHECK (remote_state IN ('none', 'active', 'voided', 'deleted')),
  -- Fingerprint of what was last sent, to spot a record edited since.
  payload_hash     text,
  attempts         integer NOT NULL DEFAULT 0,
  last_error       text,
  last_attempt_at  timestamptz,
  synced_at        timestamptz,
  -- For the activity log: "INV-0007 · Hotel Calypso", and the amount.
  label            text,
  amount           numeric(12,2),
  created_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, tenant_id, entity_type, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_xero_sync_items_recent
  ON xero_sync_items(organization_id, tenant_id, last_attempt_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_xero_sync_items_status
  ON xero_sync_items(organization_id, tenant_id, status);

ALTER TABLE xero_sync_items ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON xero_sync_items FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.xero_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_xero_connections_updated_at ON xero_connections;
CREATE TRIGGER trg_xero_connections_updated_at BEFORE UPDATE ON xero_connections
  FOR EACH ROW EXECUTE FUNCTION public.xero_touch_updated_at();
