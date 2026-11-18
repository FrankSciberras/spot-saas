-- =============================================================================
-- INVOICES & CREDIT NOTES — bill customers, record what they paid, correct mistakes
-- =============================================================================
-- A fleet invoices the people who owe it money: a hotel or company with an
-- account, a partner fleet, a driver renting a car. This adds:
--
--   * invoice_settings            — per fleet: number prefixes and counters,
--                                   default VAT rate, payment terms, the bank
--                                   details printed on every invoice, and
--                                   which bookkeeping categories payments and
--                                   refunds are posted to.
--   * invoice_customers           — who gets invoiced.
--   * invoices                    — invoices AND credit notes (kind), one row
--                                   each: draft → issued → (void).
--   * invoice_lines               — what was sold: description, quantity,
--                                   unit price, VAT rate.
--   * invoice_payments            — money received against an invoice, or
--                                   refunded against a credit note.
--   * invoice_credit_allocations  — how much of a credit note was applied to
--                                   which invoice.
--
-- THE RULES THE DATABASE ITSELF ENFORCES (not just the app):
--   1. Numbers are allocated only when a document is ISSUED, from a per-fleet
--      counter locked for the transaction, so the sequence has no gaps and no
--      duplicates even if two people issue at the same moment. A draft has no
--      number. A voided document keeps its number forever.
--   2. An issued document is frozen. Its lines, totals, customer, dates and
--      number cannot be changed or deleted by anyone — the only things that
--      may still change are: being voided, and being marked as sent. A mistake
--      on an issued invoice is corrected with a credit note, which is what tax
--      authorities expect.
--   3. Totals are computed here, at issue, from the lines (per-line rounding to
--      the cent, half away from zero) — the app's preview uses the same rule.
--   4. A payment can never exceed what is still owed; credit notes for an
--      invoice can never add up to more than the invoice.
--   5. Seller and customer details are copied onto the document at issue, so an
--      old invoice still shows the address and VAT number it was issued with.
--
-- SECURITY: every table is SERVICE-ROLE ONLY (RLS on, no policies, grants
-- revoked) — same as the Bolt tables. The app reads and writes them in server
-- code that has already checked the caller is an ADMIN of the active fleet.
--
-- IDEMPOTENT: re-runnable.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0. Bookkeeping lines created by invoice payments get their own source.
-- -----------------------------------------------------------------------------
ALTER TABLE finance_transactions DROP CONSTRAINT IF EXISTS finance_transactions_source_check;
ALTER TABLE finance_transactions
  ADD CONSTRAINT finance_transactions_source_check
  CHECK (source IN ('manual', 'recurring', 'period_import', 'invoice'));

-- -----------------------------------------------------------------------------
-- 1. invoice_settings
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS invoice_settings (
  organization_id          uuid PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  -- Printable ASCII only: accounting software (Xero) rejects anything else in
  -- an invoice number.
  invoice_prefix           text NOT NULL DEFAULT 'INV-'
                             CHECK (invoice_prefix ~ '^[A-Za-z0-9/_.-]{0,12}$'),
  credit_note_prefix       text NOT NULL DEFAULT 'CN-'
                             CHECK (credit_note_prefix ~ '^[A-Za-z0-9/_.-]{0,12}$'),
  -- The number the NEXT issued document gets. Only ever moved forward.
  next_invoice_number      integer NOT NULL DEFAULT 1 CHECK (next_invoice_number > 0),
  next_credit_note_number  integer NOT NULL DEFAULT 1 CHECK (next_credit_note_number > 0),
  -- INV-0007 = padding 4.
  number_padding           smallint NOT NULL DEFAULT 4 CHECK (number_padding BETWEEN 1 AND 10),
  -- Pre-filled on every new line; each line can still use its own rate.
  default_tax_rate         numeric(5,2) NOT NULL DEFAULT 18 CHECK (default_tax_rate BETWEEN 0 AND 100),
  payment_terms_days       integer NOT NULL DEFAULT 14 CHECK (payment_terms_days BETWEEN 0 AND 365),
  -- Bank details / how to pay, printed on invoices.
  payment_instructions     text,
  footer_note              text,
  -- Post a bookkeeping line when a payment is recorded.
  record_payments_in_books boolean NOT NULL DEFAULT true,
  -- Income category for payments received; expense category for refunds paid.
  income_category_id       uuid REFERENCES org_finance_categories(id) ON DELETE SET NULL,
  refund_category_id       uuid REFERENCES org_finance_categories(id) ON DELETE SET NULL,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE invoice_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON invoice_settings FROM anon, authenticated;

-- -----------------------------------------------------------------------------
-- 2. invoice_customers
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS invoice_customers (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name            text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 200),
  contact_name    text,
  email           text,
  phone           text,
  -- Free-form, printed as written (street, town, postcode, country).
  address         text,
  vat_number      text,
  notes           text,
  -- Archived customers disappear from pickers but keep their documents.
  archived_at     timestamptz,
  created_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- One live customer per name per fleet (accounting software keys contacts by name).
CREATE UNIQUE INDEX IF NOT EXISTS uq_invoice_customers_name
  ON invoice_customers(organization_id, lower(btrim(name)))
  WHERE archived_at IS NULL;

ALTER TABLE invoice_customers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON invoice_customers FROM anon, authenticated;

-- -----------------------------------------------------------------------------
-- 3. invoices (invoices and credit notes)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS invoices (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  kind                  text NOT NULL DEFAULT 'invoice' CHECK (kind IN ('invoice', 'credit_note')),
  status                text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'issued', 'void')),
  -- NULL while a draft; set once, at issue.
  number                text,
  number_seq            integer,
  -- No ON DELETE action: a customer with documents can be archived, never
  -- deleted. (NO ACTION rather than RESTRICT throughout these tables: it is
  -- checked at the end of the statement, so deleting a whole fleet still
  -- cascades cleanly while deleting one referenced row still fails.)
  customer_id           uuid NOT NULL REFERENCES invoice_customers(id),
  -- Credit notes only: the invoice being corrected.
  credited_invoice_id   uuid REFERENCES invoices(id),
  credit_reason         text,
  issue_date            date,
  due_date              date,
  currency              text NOT NULL DEFAULT 'EUR' CHECK (currency ~ '^[A-Z]{3}$'),
  -- Customer's PO number or similar; printed on the document.
  reference             text,
  -- Free text printed under the lines.
  notes                 text,
  subtotal              numeric(12,2) NOT NULL DEFAULT 0,
  tax_total             numeric(12,2) NOT NULL DEFAULT 0,
  total                 numeric(12,2) NOT NULL DEFAULT 0,
  -- Snapshots taken at issue (rule 5).
  customer_name         text,
  customer_address      text,
  customer_vat_number   text,
  customer_email        text,
  seller_name           text,
  seller_address        text,
  seller_vat_number     text,
  seller_email          text,
  seller_phone          text,
  payment_instructions  text,
  footer_note           text,
  issued_at             timestamptz,
  issued_by             uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  voided_at             timestamptz,
  voided_by             uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  void_reason           text,
  -- Last time it was emailed to the customer, and to which address.
  sent_at               timestamptz,
  sent_to               text,
  created_by            uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT invoices_number_iff_issued CHECK ((status = 'draft') = (number IS NULL)),
  CONSTRAINT invoices_credit_note_has_invoice CHECK ((kind = 'credit_note') = (credited_invoice_id IS NOT NULL)),
  CONSTRAINT invoices_issued_has_dates CHECK (status = 'draft' OR (issue_date IS NOT NULL AND due_date IS NOT NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_invoices_number
  ON invoices(organization_id, kind, number) WHERE number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_invoices_org_status ON invoices(organization_id, kind, status, issue_date DESC);
CREATE INDEX IF NOT EXISTS idx_invoices_customer ON invoices(customer_id);
CREATE INDEX IF NOT EXISTS idx_invoices_credited ON invoices(credited_invoice_id) WHERE credited_invoice_id IS NOT NULL;

ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON invoices FROM anon, authenticated;

-- -----------------------------------------------------------------------------
-- 4. invoice_lines
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS invoice_lines (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  invoice_id      uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  position        integer NOT NULL DEFAULT 0,
  description     text NOT NULL CHECK (length(btrim(description)) BETWEEN 1 AND 500),
  quantity        numeric(12,3) NOT NULL DEFAULT 1 CHECK (quantity > 0),
  -- May be negative: a discount is a line with a negative price.
  unit_price      numeric(12,2) NOT NULL DEFAULT 0,
  tax_rate        numeric(5,2) NOT NULL DEFAULT 0 CHECK (tax_rate BETWEEN 0 AND 100),
  -- quantity × unit_price, and its VAT, each rounded to the cent.
  line_net        numeric(12,2) NOT NULL DEFAULT 0,
  line_tax        numeric(12,2) NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_invoice_lines_invoice ON invoice_lines(invoice_id, position);

ALTER TABLE invoice_lines ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON invoice_lines FROM anon, authenticated;

-- -----------------------------------------------------------------------------
-- 5. invoice_payments — received on an invoice, or refunded on a credit note
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS invoice_payments (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id        uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  invoice_id             uuid NOT NULL REFERENCES invoices(id),
  paid_on                date NOT NULL DEFAULT CURRENT_DATE,
  amount                 numeric(12,2) NOT NULL CHECK (amount > 0),
  method                 text NOT NULL DEFAULT 'bank' CHECK (method IN ('cash', 'card', 'bank', 'other')),
  reference              text,
  -- The bookkeeping line this payment posted, if any.
  finance_transaction_id uuid REFERENCES finance_transactions(id) ON DELETE SET NULL,
  created_by             uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invoice_payments_invoice ON invoice_payments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_payments_org_date ON invoice_payments(organization_id, paid_on DESC);

ALTER TABLE invoice_payments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON invoice_payments FROM anon, authenticated;

-- -----------------------------------------------------------------------------
-- 6. invoice_credit_allocations — credit note → invoice
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS invoice_credit_allocations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  credit_note_id  uuid NOT NULL REFERENCES invoices(id),
  invoice_id      uuid NOT NULL REFERENCES invoices(id),
  amount          numeric(12,2) NOT NULL CHECK (amount > 0),
  allocated_on    date NOT NULL DEFAULT CURRENT_DATE,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (credit_note_id, invoice_id)
);

CREATE INDEX IF NOT EXISTS idx_invoice_alloc_invoice ON invoice_credit_allocations(invoice_id);

ALTER TABLE invoice_credit_allocations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON invoice_credit_allocations FROM anon, authenticated;

-- -----------------------------------------------------------------------------
-- 7. updated_at
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.invoices_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_invoice_settings_updated_at ON invoice_settings;
CREATE TRIGGER trg_invoice_settings_updated_at BEFORE UPDATE ON invoice_settings
  FOR EACH ROW EXECUTE FUNCTION public.invoices_touch_updated_at();
DROP TRIGGER IF EXISTS trg_invoice_customers_updated_at ON invoice_customers;
CREATE TRIGGER trg_invoice_customers_updated_at BEFORE UPDATE ON invoice_customers
  FOR EACH ROW EXECUTE FUNCTION public.invoices_touch_updated_at();
DROP TRIGGER IF EXISTS trg_invoices_updated_at ON invoices;
CREATE TRIGGER trg_invoices_updated_at BEFORE UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION public.invoices_touch_updated_at();

-- -----------------------------------------------------------------------------
-- 8. Rule 2 — issued documents are frozen
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.invoices_guard_frozen()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    -- The fleet itself is being deleted (cascade): nothing left to protect.
    IF OLD.status <> 'draft' AND EXISTS (SELECT 1 FROM organizations WHERE id = OLD.organization_id) THEN
      RAISE EXCEPTION 'An issued document cannot be deleted. Void it or issue a credit note instead.'
        USING ERRCODE = 'P0001';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.status = 'draft' THEN
    RETURN NEW;
  END IF;

  IF OLD.status = 'void' AND NEW.status <> 'void' THEN
    RAISE EXCEPTION 'A voided document stays voided.' USING ERRCODE = 'P0001';
  END IF;
  IF NEW.status = 'draft' THEN
    RAISE EXCEPTION 'An issued document cannot go back to a draft.' USING ERRCODE = 'P0001';
  END IF;

  -- Everything that is printed on the document, or identifies it, is frozen.
  IF (NEW.organization_id, NEW.kind, NEW.number, NEW.number_seq, NEW.customer_id, NEW.issue_date,
      NEW.due_date, NEW.currency, NEW.subtotal, NEW.tax_total, NEW.total, NEW.issued_at)
     IS DISTINCT FROM
     (OLD.organization_id, OLD.kind, OLD.number, OLD.number_seq, OLD.customer_id, OLD.issue_date,
      OLD.due_date, OLD.currency, OLD.subtotal, OLD.tax_total, OLD.total, OLD.issued_at)
     OR NEW.credited_invoice_id IS DISTINCT FROM OLD.credited_invoice_id
     OR NEW.credit_reason IS DISTINCT FROM OLD.credit_reason
     OR NEW.reference IS DISTINCT FROM OLD.reference
     OR NEW.notes IS DISTINCT FROM OLD.notes
     OR NEW.customer_name IS DISTINCT FROM OLD.customer_name
     OR NEW.customer_address IS DISTINCT FROM OLD.customer_address
     OR NEW.customer_vat_number IS DISTINCT FROM OLD.customer_vat_number
     OR NEW.customer_email IS DISTINCT FROM OLD.customer_email
     OR NEW.seller_name IS DISTINCT FROM OLD.seller_name
     OR NEW.seller_address IS DISTINCT FROM OLD.seller_address
     OR NEW.seller_vat_number IS DISTINCT FROM OLD.seller_vat_number
     OR NEW.seller_email IS DISTINCT FROM OLD.seller_email
     OR NEW.seller_phone IS DISTINCT FROM OLD.seller_phone
     OR NEW.payment_instructions IS DISTINCT FROM OLD.payment_instructions
     OR NEW.footer_note IS DISTINCT FROM OLD.footer_note
  THEN
    RAISE EXCEPTION 'An issued document cannot be changed. Issue a credit note to correct it.'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_invoices_guard_frozen ON invoices;
CREATE TRIGGER trg_invoices_guard_frozen BEFORE UPDATE OR DELETE ON invoices
  FOR EACH ROW EXECUTE FUNCTION public.invoices_guard_frozen();

CREATE OR REPLACE FUNCTION public.invoice_lines_guard_frozen()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_status text;
  v_invoice uuid;
BEGIN
  v_invoice := CASE WHEN TG_OP = 'DELETE' THEN OLD.invoice_id ELSE NEW.invoice_id END;
  SELECT status INTO v_status FROM invoices WHERE id = v_invoice;
  -- No parent row = the draft itself is being deleted (cascade): allow.
  IF v_status IS NOT NULL AND v_status <> 'draft' THEN
    RAISE EXCEPTION 'The lines of an issued document cannot be changed.' USING ERRCODE = 'P0001';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.invoice_id IS DISTINCT FROM OLD.invoice_id THEN
    RAISE EXCEPTION 'A line cannot be moved to another document.' USING ERRCODE = 'P0001';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

DROP TRIGGER IF EXISTS trg_invoice_lines_guard_frozen ON invoice_lines;
CREATE TRIGGER trg_invoice_lines_guard_frozen BEFORE INSERT OR UPDATE OR DELETE ON invoice_lines
  FOR EACH ROW EXECUTE FUNCTION public.invoice_lines_guard_frozen();

-- -----------------------------------------------------------------------------
-- 9. Balances — the one definition of "still owed" and "credit left"
-- -----------------------------------------------------------------------------
-- For an invoice: total − payments received − credit notes applied to it.
-- For a credit note: total − amounts applied to invoices − refunds paid out.
CREATE OR REPLACE FUNCTION public.invoice_balance(p_invoice uuid)
RETURNS numeric LANGUAGE sql STABLE AS $$
  SELECT CASE
    WHEN i.status <> 'issued' THEN 0::numeric
    WHEN i.kind = 'invoice' THEN
      i.total
      - COALESCE((SELECT sum(p.amount) FROM invoice_payments p WHERE p.invoice_id = i.id), 0)
      - COALESCE((SELECT sum(a.amount) FROM invoice_credit_allocations a WHERE a.invoice_id = i.id), 0)
    ELSE
      i.total
      - COALESCE((SELECT sum(a.amount) FROM invoice_credit_allocations a WHERE a.credit_note_id = i.id), 0)
      - COALESCE((SELECT sum(p.amount) FROM invoice_payments p WHERE p.invoice_id = i.id), 0)
  END
  FROM invoices i WHERE i.id = p_invoice;
$$;

-- -----------------------------------------------------------------------------
-- 10. Issue a draft (rules 1, 3, 4, 5)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.invoice_issue(
  p_org        uuid,
  p_invoice    uuid,
  p_user       uuid,
  p_issue_date date DEFAULT NULL
)
RETURNS invoices
LANGUAGE plpgsql
AS $$
DECLARE
  v_settings  invoice_settings%ROWTYPE;
  v_inv       invoices%ROWTYPE;
  v_cust      invoice_customers%ROWTYPE;
  v_org       organizations%ROWTYPE;
  v_orig      invoices%ROWTYPE;
  v_seq       integer;
  v_number    text;
  v_subtotal  numeric(12,2);
  v_tax       numeric(12,2);
  v_total     numeric(12,2);
  v_credited  numeric(12,2);
  v_apply     numeric(12,2);
  v_date      date;
  v_lines     integer;
  v_last_date date;
BEGIN
  -- Lock the counter first: everyone issuing for this fleet queues here.
  INSERT INTO invoice_settings (organization_id) VALUES (p_org) ON CONFLICT (organization_id) DO NOTHING;
  SELECT * INTO v_settings FROM invoice_settings WHERE organization_id = p_org FOR UPDATE;

  SELECT * INTO v_inv FROM invoices WHERE id = p_invoice AND organization_id = p_org FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That document no longer exists.' USING ERRCODE = 'P0001';
  END IF;
  IF v_inv.status <> 'draft' THEN
    RAISE EXCEPTION 'This document has already been issued.' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_cust FROM invoice_customers WHERE id = v_inv.customer_id AND organization_id = p_org;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Choose a customer before issuing.' USING ERRCODE = 'P0001';
  END IF;

  -- Rule 3: recompute every line and the totals from scratch.
  UPDATE invoice_lines
     SET line_net = round(quantity * unit_price, 2),
         line_tax = round(round(quantity * unit_price, 2) * tax_rate / 100, 2)
   WHERE invoice_id = p_invoice;

  SELECT count(*), COALESCE(sum(line_net), 0), COALESCE(sum(line_tax), 0)
    INTO v_lines, v_subtotal, v_tax
    FROM invoice_lines WHERE invoice_id = p_invoice;
  v_total := v_subtotal + v_tax;

  IF v_lines = 0 THEN
    RAISE EXCEPTION 'Add at least one line before issuing.' USING ERRCODE = 'P0001';
  END IF;
  IF v_total <= 0 THEN
    RAISE EXCEPTION 'The total must be more than zero.' USING ERRCODE = 'P0001';
  END IF;

  v_date := COALESCE(p_issue_date, v_inv.issue_date, CURRENT_DATE);
  -- One day of slack: the server's date is UTC, the fleet's may be a day ahead.
  IF v_date > CURRENT_DATE + 1 THEN
    RAISE EXCEPTION 'A document cannot be dated in the future.' USING ERRCODE = 'P0001';
  END IF;
  -- Numbers and dates run in the same order: no document may be dated before
  -- the one numbered just before it.
  SELECT max(issue_date) INTO v_last_date FROM invoices
   WHERE organization_id = p_org AND kind = v_inv.kind AND status <> 'draft';
  IF v_last_date IS NOT NULL AND v_date < v_last_date THEN
    RAISE EXCEPTION 'The date cannot be earlier than your latest % (%).',
      CASE WHEN v_inv.kind = 'invoice' THEN 'invoice' ELSE 'credit note' END, v_last_date
      USING ERRCODE = 'P0001';
  END IF;

  -- Rule 4 (credit notes): must correct an issued invoice of the same customer,
  -- and all credit notes for that invoice together may not exceed it.
  IF v_inv.kind = 'credit_note' THEN
    SELECT * INTO v_orig FROM invoices
     WHERE id = v_inv.credited_invoice_id AND organization_id = p_org FOR UPDATE;
    IF NOT FOUND OR v_orig.kind <> 'invoice' OR v_orig.status <> 'issued' THEN
      RAISE EXCEPTION 'A credit note can only be issued against an issued invoice.' USING ERRCODE = 'P0001';
    END IF;
    IF v_orig.customer_id <> v_inv.customer_id THEN
      RAISE EXCEPTION 'A credit note must be for the same customer as its invoice.' USING ERRCODE = 'P0001';
    END IF;
    IF v_orig.currency <> v_inv.currency THEN
      RAISE EXCEPTION 'A credit note must be in the same currency as its invoice.' USING ERRCODE = 'P0001';
    END IF;
    IF v_date < v_orig.issue_date THEN
      RAISE EXCEPTION 'A credit note cannot be dated before its invoice.' USING ERRCODE = 'P0001';
    END IF;
    SELECT COALESCE(sum(total), 0) INTO v_credited FROM invoices
     WHERE credited_invoice_id = v_orig.id AND kind = 'credit_note' AND status = 'issued';
    IF v_credited + v_total > v_orig.total THEN
      RAISE EXCEPTION 'This would credit more than the invoice is worth (% already credited of %).',
        v_credited, v_orig.total USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- Rule 1: take the next number.
  IF v_inv.kind = 'invoice' THEN
    v_seq := v_settings.next_invoice_number;
    v_number := v_settings.invoice_prefix || lpad(v_seq::text, v_settings.number_padding, '0');
    UPDATE invoice_settings SET next_invoice_number = v_seq + 1 WHERE organization_id = p_org;
  ELSE
    v_seq := v_settings.next_credit_note_number;
    v_number := v_settings.credit_note_prefix || lpad(v_seq::text, v_settings.number_padding, '0');
    UPDATE invoice_settings SET next_credit_note_number = v_seq + 1 WHERE organization_id = p_org;
  END IF;

  SELECT * INTO v_org FROM organizations WHERE id = p_org;

  -- Rule 5: snapshots. (Still a draft at this point, so the freeze allows it.)
  UPDATE invoices SET
    status               = 'issued',
    number               = v_number,
    number_seq           = v_seq,
    issue_date           = v_date,
    due_date             = CASE
                             WHEN kind = 'credit_note' THEN v_date
                             WHEN due_date IS NOT NULL AND due_date >= v_date THEN due_date
                             ELSE v_date + v_settings.payment_terms_days
                           END,
    subtotal             = v_subtotal,
    tax_total            = v_tax,
    total                = v_total,
    customer_name        = v_cust.name,
    customer_address     = v_cust.address,
    customer_vat_number  = v_cust.vat_number,
    customer_email       = v_cust.email,
    seller_name          = COALESCE(NULLIF(btrim(v_org.legal_name), ''), v_org.name),
    seller_address       = v_org.address,
    seller_vat_number    = v_org.vat_number,
    seller_email         = v_org.contact_email,
    seller_phone         = v_org.contact_phone,
    payment_instructions = CASE WHEN kind = 'invoice' THEN v_settings.payment_instructions END,
    footer_note          = v_settings.footer_note,
    issued_at            = now(),
    issued_by            = p_user
  WHERE id = p_invoice
  RETURNING * INTO v_inv;

  -- A credit note is applied to its invoice straight away, up to what is still
  -- owed on it. Anything left over stays as credit that can be refunded.
  IF v_inv.kind = 'credit_note' THEN
    v_apply := LEAST(v_total, GREATEST(public.invoice_balance(v_orig.id), 0));
    IF v_apply > 0 THEN
      INSERT INTO invoice_credit_allocations (organization_id, credit_note_id, invoice_id, amount, allocated_on)
      VALUES (p_org, v_inv.id, v_orig.id, v_apply, v_date);
    END IF;
  END IF;

  RETURN v_inv;
END;
$$;

-- -----------------------------------------------------------------------------
-- 11. Void an issued document
-- -----------------------------------------------------------------------------
-- Only a document nothing depends on can be voided: no payments, no refunds,
-- no credit applied in either direction. Otherwise the money trail would point
-- at a document that no longer counts.
CREATE OR REPLACE FUNCTION public.invoice_void(
  p_org     uuid,
  p_invoice uuid,
  p_user    uuid,
  p_reason  text DEFAULT NULL
)
RETURNS invoices
LANGUAGE plpgsql
AS $$
DECLARE
  v_inv invoices%ROWTYPE;
BEGIN
  SELECT * INTO v_inv FROM invoices WHERE id = p_invoice AND organization_id = p_org FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That document no longer exists.' USING ERRCODE = 'P0001';
  END IF;
  IF v_inv.status = 'draft' THEN
    RAISE EXCEPTION 'A draft is deleted, not voided.' USING ERRCODE = 'P0001';
  END IF;
  IF v_inv.status = 'void' THEN
    RETURN v_inv;
  END IF;

  IF EXISTS (SELECT 1 FROM invoice_payments WHERE invoice_id = p_invoice) THEN
    RAISE EXCEPTION '%', CASE WHEN v_inv.kind = 'invoice'
      THEN 'This invoice has payments recorded. Remove them first, or issue a credit note instead.'
      ELSE 'This credit note has been refunded, so it cannot be voided.' END
      USING ERRCODE = 'P0001';
  END IF;
  IF v_inv.kind = 'invoice' THEN
    IF EXISTS (SELECT 1 FROM invoices WHERE credited_invoice_id = p_invoice AND status = 'issued') THEN
      RAISE EXCEPTION 'This invoice has a credit note against it, so it cannot be voided.' USING ERRCODE = 'P0001';
    END IF;
    -- Unissued credit-note drafts for it are simply removed.
    DELETE FROM invoices WHERE credited_invoice_id = p_invoice AND status = 'draft';
  ELSIF EXISTS (SELECT 1 FROM invoice_credit_allocations WHERE credit_note_id = p_invoice) THEN
    RAISE EXCEPTION 'This credit note has been applied to its invoice, so it cannot be voided. Issue a new invoice to reverse it.'
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE invoices
     SET status = 'void', voided_at = now(), voided_by = p_user, void_reason = NULLIF(btrim(p_reason), '')
   WHERE id = p_invoice
   RETURNING * INTO v_inv;
  RETURN v_inv;
END;
$$;

-- -----------------------------------------------------------------------------
-- 12. Record a payment (on an invoice) or a refund (on a credit note)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.invoice_record_payment(
  p_org       uuid,
  p_invoice   uuid,
  p_amount    numeric,
  p_paid_on   date,
  p_method    text,
  p_reference text,
  p_user      uuid
)
RETURNS invoice_payments
LANGUAGE plpgsql
AS $$
DECLARE
  v_inv       invoices%ROWTYPE;
  v_settings  invoice_settings%ROWTYPE;
  v_balance   numeric(12,2);
  v_amount    numeric(12,2);
  v_payment   invoice_payments%ROWTYPE;
  v_category  uuid;
  v_txn       uuid;
BEGIN
  SELECT * INTO v_inv FROM invoices WHERE id = p_invoice AND organization_id = p_org FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That document no longer exists.' USING ERRCODE = 'P0001';
  END IF;
  IF v_inv.status <> 'issued' THEN
    RAISE EXCEPTION 'Payments can only be recorded on an issued document.' USING ERRCODE = 'P0001';
  END IF;

  v_amount := round(p_amount, 2);
  IF v_amount IS NULL OR v_amount <= 0 THEN
    RAISE EXCEPTION 'Enter an amount greater than zero.' USING ERRCODE = 'P0001';
  END IF;
  IF p_paid_on IS NULL THEN
    RAISE EXCEPTION 'Enter the date of the payment.' USING ERRCODE = 'P0001';
  END IF;
  IF p_paid_on < v_inv.issue_date THEN
    RAISE EXCEPTION 'A payment cannot be dated before the document was issued (%).', v_inv.issue_date
      USING ERRCODE = 'P0001';
  END IF;

  v_balance := public.invoice_balance(p_invoice);
  IF v_amount > v_balance THEN
    RAISE EXCEPTION '%', CASE WHEN v_inv.kind = 'invoice'
      THEN format('Only %s is still owed on this invoice.', v_balance)
      ELSE format('Only %s of this credit note is left to refund.', v_balance) END
      USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO invoice_payments (organization_id, invoice_id, paid_on, amount, method, reference, created_by)
  VALUES (p_org, p_invoice, p_paid_on, v_amount, COALESCE(p_method, 'bank'), NULLIF(btrim(p_reference), ''), p_user)
  RETURNING * INTO v_payment;

  -- Bookkeeping: income for a payment received, expense for a refund paid out.
  SELECT * INTO v_settings FROM invoice_settings WHERE organization_id = p_org;
  IF FOUND AND v_settings.record_payments_in_books THEN
    v_category := CASE WHEN v_inv.kind = 'invoice' THEN v_settings.income_category_id
                       ELSE v_settings.refund_category_id END;
    IF v_category IS NOT NULL AND EXISTS (
      SELECT 1 FROM org_finance_categories c
       WHERE c.id = v_category AND c.organization_id = p_org
         AND c.kind = CASE WHEN v_inv.kind = 'invoice' THEN 'income' ELSE 'expense' END
    ) THEN
      INSERT INTO finance_transactions
        (organization_id, txn_date, category_id, amount, description, counterparty, payment_method,
         source, source_ref, created_by)
      VALUES
        (p_org, p_paid_on, v_category, v_amount,
         CASE WHEN v_inv.kind = 'invoice' THEN 'Invoice ' ELSE 'Refund of credit note ' END || v_inv.number,
         v_inv.customer_name, COALESCE(p_method, 'bank'), 'invoice', v_payment.id, p_user)
      RETURNING id INTO v_txn;
      UPDATE invoice_payments SET finance_transaction_id = v_txn WHERE id = v_payment.id
      RETURNING * INTO v_payment;
    END IF;
  END IF;

  RETURN v_payment;
END;
$$;

-- -----------------------------------------------------------------------------
-- 13. Remove a payment (and the bookkeeping line it posted)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.invoice_delete_payment(p_org uuid, p_payment uuid)
RETURNS invoice_payments
LANGUAGE plpgsql
AS $$
DECLARE
  v_payment invoice_payments%ROWTYPE;
BEGIN
  SELECT * INTO v_payment FROM invoice_payments WHERE id = p_payment AND organization_id = p_org FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That payment no longer exists.' USING ERRCODE = 'P0001';
  END IF;
  -- Serialise with anything else touching this document's balance.
  PERFORM 1 FROM invoices WHERE id = v_payment.invoice_id FOR UPDATE;

  DELETE FROM invoice_payments WHERE id = p_payment;
  IF v_payment.finance_transaction_id IS NOT NULL THEN
    DELETE FROM finance_transactions
     WHERE id = v_payment.finance_transaction_id AND organization_id = p_org AND source = 'invoice';
  END IF;
  RETURN v_payment;
END;
$$;

-- These are called by the server with the service role only.
REVOKE ALL ON FUNCTION public.invoice_balance(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.invoice_issue(uuid, uuid, uuid, date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.invoice_void(uuid, uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.invoice_record_payment(uuid, uuid, numeric, date, text, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.invoice_delete_payment(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.invoice_balance(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.invoice_issue(uuid, uuid, uuid, date) TO service_role;
GRANT EXECUTE ON FUNCTION public.invoice_void(uuid, uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.invoice_record_payment(uuid, uuid, numeric, date, text, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.invoice_delete_payment(uuid, uuid) TO service_role;

-- -----------------------------------------------------------------------------
-- 14. Invoices becomes a real module (it was listed as "coming soon")
-- -----------------------------------------------------------------------------
-- Nothing to do here: lib/modules/catalog.ts carries the status and default.
