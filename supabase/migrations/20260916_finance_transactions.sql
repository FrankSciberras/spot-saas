-- =============================================================================
-- FINANCE TRANSACTIONS — a real ledger: one dated line per expense or income
-- =============================================================================
-- Until now the books were kept the way a paper cash-book is closed: the
-- operator opened a "period" (a week, a month, a custom range) and typed ONE
-- TOTAL per category into it. That meant a €20 car wash on a Tuesday had
-- nowhere to go until the week was closed — it had to be remembered, or
-- written on a receipt and added up on Sunday. Nothing about the day it
-- happened, which car it was for, or what it actually was, survived.
--
-- Every mainstream bookkeeping tool (Xero, QuickBooks, Wave, FreshBooks) works
-- the other way round: you record each transaction the moment it happens —
-- date, amount, category, a note, optionally a receipt photo — and weekly /
-- monthly / quarterly figures are just SUMS OVER A DATE RANGE. There are no
-- periods to open or close. This migration moves Rovora to that model.
--
--   * finance_transactions — the ledger. One row per expense or income event.
--     Direction (income / expense) comes from the category, exactly as it did
--     for bookkeeping_entries, so the chart of accounts stays the single
--     source of truth for what counts as what.
--   * vehicle_recurring_costs.posted_through — recurring costs stop being a
--     "prefill" for period forms and become repeating bills (Xero's term):
--     the app posts one transaction per due date automatically. This column
--     records the last due date already posted so posting is idempotent.
--   * Backfill — every existing period entry becomes a transaction dated on
--     the period's END date (the day those books were closed), tagged
--     source = 'period_import' so it can always be traced back. Nothing is
--     lost: the totals a fleet has today are the same totals afterwards.
--
-- bookkeeping_periods / bookkeeping_entries are deliberately LEFT IN PLACE and
-- unread, as a rollback path — the same treatment weekly_bookkeeping got in
-- 20260727. Drop both in a later migration once this has run in production.
--
-- IDEMPOTENT: re-runnable.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. The ledger.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS finance_transactions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  -- The day the money moved. Every report is a range query on this.
  txn_date        date NOT NULL DEFAULT CURRENT_DATE,
  -- ON DELETE RESTRICT, as for bookkeeping_entries: a category with history
  -- can be deactivated but never deleted out from under its transactions.
  category_id     uuid NOT NULL REFERENCES org_finance_categories(id) ON DELETE RESTRICT,
  -- Always positive; direction comes from the category's kind.
  amount          numeric(12,2) NOT NULL CHECK (amount > 0),
  -- What it was: "Car wash", "Uber weekly payout", "New tyres front".
  description     text,
  -- Who it was paid to / received from. Free text — fleets rarely need a
  -- contacts table for this, and Xero's own bank import treats it the same way.
  counterparty    text,
  payment_method  text NOT NULL DEFAULT 'card'
                    CHECK (payment_method IN ('cash', 'card', 'bank', 'other')),
  -- Optional links so a cost can be traced to a car or a driver. SET NULL,
  -- not CASCADE: selling a car must not erase the money spent on it.
  vehicle_id      uuid REFERENCES vehicles(id) ON DELETE SET NULL,
  driver_id       uuid REFERENCES drivers(id) ON DELETE SET NULL,
  -- Object path in the private `documents` bucket (receipts/<org>/<id>/…).
  -- Served via short-lived signed URLs, never a public link.
  receipt_path    text,
  -- Where the line came from. 'manual' is a human typing it in; 'recurring'
  -- is a repeating cost posted by the app; 'period_import' is the backfill.
  source          text NOT NULL DEFAULT 'manual'
                    CHECK (source IN ('manual', 'recurring', 'period_import')),
  -- The recurring cost or legacy period this line was generated from.
  source_ref      uuid,
  created_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_finance_txns_org_date
  ON finance_transactions(organization_id, txn_date DESC);
CREATE INDEX IF NOT EXISTS idx_finance_txns_org_category
  ON finance_transactions(organization_id, category_id);
CREATE INDEX IF NOT EXISTS idx_finance_txns_vehicle
  ON finance_transactions(vehicle_id) WHERE vehicle_id IS NOT NULL;

-- Generated lines land exactly once: a repeating cost posts at most ONE line
-- per due date however many times the poster runs (cron and the page-load
-- catch-up can overlap), and the backfill below is re-runnable because each
-- legacy period entry maps to one (period, end date, category). Manual lines
-- have source_ref NULL, and NULLs never collide in a unique index, so they are
-- unaffected. Deliberately NOT a partial index: PostgREST's upsert infers the
-- conflict target from a plain column list and cannot match a WHERE clause.
CREATE UNIQUE INDEX IF NOT EXISTS uq_finance_txns_generated_once
  ON finance_transactions(source_ref, txn_date, category_id);

-- -----------------------------------------------------------------------------
-- 2. Housekeeping triggers — same helpers the other bookkeeping tables use.
-- -----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_finance_txns_updated_at ON finance_transactions;
CREATE TRIGGER trg_finance_txns_updated_at
  BEFORE UPDATE ON finance_transactions
  FOR EACH ROW EXECUTE FUNCTION public.set_bookkeeping_updated_at();

DROP TRIGGER IF EXISTS set_org_id ON finance_transactions;
CREATE TRIGGER set_org_id
  BEFORE INSERT ON finance_transactions
  FOR EACH ROW EXECUTE FUNCTION public.set_default_organization_id();

-- -----------------------------------------------------------------------------
-- 3. RLS — admin-only, matching every other bookkeeping table.
-- -----------------------------------------------------------------------------
ALTER TABLE finance_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage finance transactions in org" ON finance_transactions;
CREATE POLICY "Admins manage finance transactions in org"
  ON finance_transactions FOR ALL TO authenticated
  USING (public.is_org_admin(organization_id))
  WITH CHECK (public.is_org_admin(organization_id));

-- -----------------------------------------------------------------------------
-- 4. Recurring costs become repeating bills.
--    posted_through = the last due date that has a transaction. NULL means
--    "nothing posted yet — start from start_date". Existing costs are set to
--    today: the weeks already closed had these costs prorated into them, so
--    posting history again would double count.
-- -----------------------------------------------------------------------------
ALTER TABLE vehicle_recurring_costs
  ADD COLUMN IF NOT EXISTS posted_through date;

UPDATE vehicle_recurring_costs
SET posted_through = CURRENT_DATE
WHERE posted_through IS NULL
  AND created_at < now() - interval '1 minute';

-- -----------------------------------------------------------------------------
-- 5. Backfill — every legacy period entry becomes one transaction, dated on
--    the day the period ended. Amount, category and fleet are carried over
--    exactly; the description says which set of books it came from.
-- -----------------------------------------------------------------------------
INSERT INTO finance_transactions
  (organization_id, txn_date, category_id, amount, description, payment_method,
   source, source_ref, created_by, created_at)
SELECT
  e.organization_id,
  p.end_date,
  e.category_id,
  e.amount,
  COALESCE(NULLIF(e.note, ''), 'Period total · ' || COALESCE(p.name, p.label)),
  'bank',
  'period_import',
  p.id,
  p.created_by,
  p.created_at
FROM bookkeeping_entries e
JOIN bookkeeping_periods p ON p.id = e.period_id
WHERE e.amount > 0
ON CONFLICT (source_ref, txn_date, category_id) DO NOTHING;

SELECT 'Finance transactions ledger installed; legacy period entries imported.' AS message;
