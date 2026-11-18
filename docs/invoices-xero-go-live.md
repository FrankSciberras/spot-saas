# Invoices and Xero — going live

Two features, two switches. Invoices needs one database migration. Xero needs a
second migration plus Rovora's own Xero app credentials. Until each is done the
product says "not switched on for this workspace yet" on that page; nothing
breaks.

## 1. Invoices

1. Apply `supabase/migrations/20261118_invoices.sql` (re-runnable).
2. Deploy. "Invoices" appears under Financial for fleet admins (module on by
   default; a fleet can switch it off under Integrations → Your modules).
3. In a test fleet, check end to end:
   - Settings → General has the legal name, address and VAT number (they are
     printed on invoices), then Invoices → Settings: prefix, VAT rate, bank
     details.
   - Add a customer, create an invoice, save as draft, issue it → it gets
     `INV-0001`, and can no longer be edited.
   - Download the PDF; email it to yourself (needs `RESEND_API_KEY`).
   - Record a part payment → balance drops, a line appears in Bookkeeping
     labelled "Invoice" (read-only there).
   - Create a credit note for part of it → `CN-0001`, balance drops again.
   - Remove the payment → the Bookkeeping line goes with it.

What the database enforces (tested in `tests/invoices-migration.test.mjs`):
gap-free numbering per fleet, issued documents frozen, payments never above
what is owed, credit notes never above the invoice, dates in number order.

## 2. Xero

1. Apply `supabase/migrations/20261118_xero_integration.sql` (re-runnable).
2. Create the app at <https://developer.xero.com/app/manage> → New app →
   **Web app**.
   - Redirect URI: `https://<app host>/api/xero/callback`
     (the host in `NEXT_PUBLIC_APP_URL`).
   - Copy the Client ID, generate a Client Secret.
3. Set `XERO_CLIENT_ID` and `XERO_CLIENT_SECRET` in the app's environment and
   redeploy. The Xero tile then appears on the integrations pages and
   `/fleet/xero` offers "Connect to Xero".
4. Make sure `INTEGRATIONS_SECRET_KEY` is set and will not change: it encrypts
   the stored Xero tokens. Changing it means every fleet reconnects.
5. The hourly job is already in `.github/workflows/cron.yml`
   (`/api/cron/xero-sync`, minute 50). It also keeps quiet fleets connected:
   Xero's refresh token dies after 60 days without use.
6. **Test against Xero's Demo Company first** (free, in any Xero login: My
   Xero → Try the Demo Company). Connect it from a test fleet, then:
   - choose the sales account and a tax rate for each VAT rate → Save;
   - issue an invoice → it is in Xero within a few seconds, same number,
     customer, lines, VAT and total;
   - issue a credit note → created and allocated to the invoice;
   - switch "Send payments" on, pick the bank account, record a payment →
     the invoice shows as paid in Xero;
   - remove the payment and void the invoice → both follow in Xero;
   - check the Activity list shows each step, and "Open in Xero" lands on it.

### Limits to know about

- A new Xero app is on Xero's **Starter tier: 5 connected organisations** and
  1,000 API calls per organisation per day. Apply to Xero for the next tier
  before a sixth fleet connects. (Source: Xero developer docs, "OAuth 2.0 API
  limits", read 18 Nov 2026.)
- The scopes requested are Xero's granular ones (`accounting.invoices`,
  `accounting.payments`, `accounting.banktransactions`, `accounting.contacts`,
  `accounting.settings.read`, `offline_access`). The older broad
  `accounting.transactions` scope is not issued to new apps.
- One-way only. Something changed or deleted directly in Xero is not pulled
  back; a payment Xero cannot delete because it is reconciled shows up in the
  Activity list as refused, with Xero's reason.

### What has and has not been tested

- The sync logic is tested against an in-memory Xero that enforces Xero's
  rules (`tests/xero-sync.test.mjs`, 20 scenarios: lost responses, rate limits,
  refused tokens, deletions, voids, start-date changes, mapping gaps).
- The HTTP layer (`lib/xero/client.ts`) is written from Xero's documentation
  and has **not** been run against a real Xero organisation — that needs the
  app credentials from step 2. Step 6 is that test.

## Running the tests

```bash
npm test
```

The database test needs an in-memory Postgres that is not a project
dependency; without it that one suite is skipped:

```bash
npm i --no-save @electric-sql/pglite
```
