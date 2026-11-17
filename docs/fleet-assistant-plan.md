# Rovora AI — fleet assistant (plan)

Status: **plan, not built yet** · Owner session: `claude/adoring-pasteur-ksjrzo` · 2026-11-17

A chat assistant inside the fleet dashboard (`/fleet/*`) that a fleet manager can
ask anything about their own fleet — "Which car cost me the most last month?",
"Who hasn't done a pre-shift check this week?", "How much did Bolt bring in this
week vs last?" — and that answers from the fleet's live data, with links to the
records it used. This is the "Fleet assistant" already promised on `/ai`.

---

## 1. How it works (one paragraph)

The browser sends the question to a new route, `POST /api/assistant`. The route
works out who is asking (fleet, role, enabled modules, currency) and calls the
LLM with a short system prompt plus a list of **read-only tools** — typed
functions like `finance_summary(period, group_by)` or `shifts_summary(period)`.
The model picks tools, the server runs them **as the signed-in user** (RLS +
explicit `organization_id` filter + role/module checks), returns compact JSON, and
the model writes the answer. The reply streams back with a "Sources" row linking
to the dashboard pages behind the numbers. The model never writes SQL and never
sees data the user couldn't open in the dashboard.

```
FleetTopbar "Ask AI" ─► AssistantDrawer ─► POST /api/assistant (stream)
                                              │
                         lib/assistant/context.ts  (session, org, role, modules, money fmt, tz)
                         lib/assistant/provider.ts (LLM call, tool loop, streaming)
                         lib/assistant/tools/*.ts  (read-only, scoped, PII-free)
                                              │
                                   Supabase (RLS client + org filter)
```

## 2. Decisions (defaults — change any of them)

| # | Decision | Default |
|---|---|---|
| D1 | LLM provider | Reuse the **OpenAI** key the website chatbot already uses (`OPENAI_API_KEY`, billing exists). Behind a small adapter so it can be swapped. Own model var `FLEET_ASSISTANT_MODEL`, chosen by testing on the demo fleet (the website bot's small model may be too weak for multi-step tool use). |
| D2 | Who can use it | **Admins and staff.** Staff get operations answers only (drivers, vehicles, shifts, rosters, services, damages, reminders, safety). **Money answers (bookkeeping, financials, Bolt, settlements) are admin-only**, matching the dashboard's page gates. A later fleet setting can let staff ask about money. |
| D3 | Read-only v1 | Yes. No tool can change data. Actions (create reminder, message a driver) come in phase 3 with an explicit confirm button. |
| D4 | Rollout | New module `assistant` in `lib/modules/catalog.ts`, **off by default** during beta; switched on for the demo fleet and pilot customers. |
| D5 | Cost control | Per-user rate limit (Postgres-backed, like `api_rate_limit_consume`) + a monthly question cap per fleet. Free during beta; price it after we see usage. |
| D6 | Privacy | Update `app/privacy/page.tsx` before launch — it currently says OpenAI gets "no fleet, driver or location data ever". Tools never send ID/licence numbers, phone, address, email or photos. |

## 3. Tools (v1)

Each tool = `name`, `description`, JSON-schema params, `requires: { roles, module? }`,
`run(ctx, args)` → `{ data, sources: [{label, href}] }`. Periods use the dashboard's
own helpers (`lib/utils/financeRanges.ts`, Malta time today) so numbers match the
screens exactly.

| Tool | Answers | Built on | Who |
|---|---|---|---|
| `fleet_overview` | headcount, vehicles by status, on shift now, expiring docs, services due, open damages/reminders | `app/fleet/page.tsx` logic | admin, staff |
| `find` | "the white Prius", "Joe" → driver/vehicle ids | `app/api/search/route.ts` | admin, staff |
| `get_driver` | one driver: vehicle, documents, recent shifts, safety, (admin: settlements) | drivers + shifts + `lib/tracking/safety.ts` | admin, staff |
| `get_vehicle` | one vehicle: mileage, services, damages, (admin: costs) | `lib/maintenance/serviceDue.ts` | admin, staff |
| `shifts_summary` | hours/km/shifts per driver or vehicle; **missed pre-shift checks** | `app/api/shifts/hours` logic | admin, staff |
| `documents_expiring` | what expires in N days | expiry columns + `documents.*` settings | admin, staff |
| `services_due` | vehicles due/overdue for service | `latestServiceByVehicle` + `maintenance.service_due_km` | admin, staff (maintenance) |
| `damages` | open damages, by vehicle, repair cost | `vehicle_damages` | admin, staff |
| `reminders` | open / overdue / assigned to me | `app/api/reminders` (has real permission check) | admin, staff (reminders) |
| `roster` | who is rostered on a day/week | `rosters`, `roster_assignments` | admin, staff (rostering) |
| `finance_summary` | income/expenses/net by category, vehicle or driver, vs previous period | extract `app/api/v1/financials/summary` into a shared lib fn | admin (bookkeeping) |
| `vehicle_costs` | **total cost per vehicle** (bookkeeping + services + damage repairs + parts) — new | `finance_transactions`, `vehicle_services.cost`, `vehicle_damages.repair_cost`, `part_usage` | admin |
| `settlements_summary` | per week/driver gross, net, balance, paid/unpaid | `driver_settlements`, `settlement_platforms` | admin (settlements) |
| `bolt_stats` | rides, fares, acceptance, busy hours, by driver/vehicle | `lib/bolt/stats.ts` `summarizeRides` (written with this in mind) | admin (bolt) |
| `safety_summary` | safety scores, speeding, harsh events | `lib/tracking/safety.ts` | admin, staff (tracking) |

Later: `parts_low_stock`, GPS tracker tools (after GPS ships), Uber once imports exist.
Not used: `/api/statistics/{bolt,uber}` — those return **mock data**.

If no tool fits, the assistant says what it can answer and suggests questions;
it never guesses numbers.

## 4. Safety rules (non-negotiable)

1. **Scope every query** by `session.organization_id` (RLS alone merges a
   multi-fleet user's orgs). Use `createClient()` (RLS); the admin client only
   where a table is service-role-only (`bolt_*`), always with the org filter.
2. Add `lib/assistant` to `SCAN_DIRS` in `scripts/check-api-isolation.js` so the
   build fails on any unscoped `.from()`.
3. Tracking RPCs `driver_distances` / `driver_max_speeds` have no org param →
   filter results to this fleet's drivers.
4. **Check role + module inside each tool** (API routes don't check modules
   today; only pages do).
5. Column allow-lists per tool (reuse `lib/api/serializers.ts`) — PII never
   leaves the server.
6. Prompt injection: DB text (notes, damage descriptions, reminder text) is
   passed as data; tools are read-only; answers render through a safe Markdown
   renderer (no HTML); links only to `/fleet/*` paths.
7. Limits: max tool rounds per question, output-token cap, upstream timeout,
   graceful fallback text (same pattern as `app/api/support-chat`).

## 5. Data (one migration)

`supabase/migrations/20261118_fleet_assistant.sql` (idempotent; **Frank runs it
in the Supabase SQL editor** — sessions never apply migrations):

- `assistant_conversations` (id, organization_id, user_id, title, created_at, updated_at)
- `assistant_messages` (id, conversation_id, organization_id, role, content,
  tool_calls jsonb, model, tokens_in, tokens_out, feedback smallint, created_at)
- RLS: a user sees only their own conversations, within their org. 90-day retention.
- Questions are **not** written to `audit_logs` (its `action` CHECK only allows
  create/update/delete and it skips admins).

## 6. UI

- **Launcher:** "Ask AI" button in `components/fleet/FleetTopbar.tsx` beside
  `MessagesButton`, plus an "Ask Rovora AI…" row in the ⌘K palette. Hidden for
  drivers and when the module is off.
- **Drawer:** right-side panel on desktop, full-screen sheet on phones, portal
  pattern from `components/messages/ChatModal.tsx` (re-applies `fleetTheme`).
  Fleet theme tokens from `app/fleet/fleet-theme.css`.
- Streaming reply, stop button, starter questions, "Sources" chips, thumbs up/down.
- **Page-aware:** sends the current path + entity id, so "how is this driver
  doing this month?" works on a driver's page.
- Markdown renderer + stream reader lifted from
  `components/marketing/RovoraSupportChat.tsx` into `components/assistant/`
  (that widget's CSS is scoped to `.rovora-site`, so it can't be reused as-is).
- Money via `lib/money.ts` (`formatMoney` / `useMoney`, from the Settings
  session) — never `fmtEUR` or a hardcoded `€`.

## 7. Phases

**Phase 1 — MVP (read-only beta)**
1. Backend: `lib/assistant/{context,provider,prompt,redact}.ts`, tools above,
   `app/api/assistant/route.ts` (+ GET self-test like support-chat).
2. Drawer UI + launcher.
3. Migration + conversation storage + rate limit / monthly cap.
4. `assistant` module (off by default), privacy page update.
5. Golden-question check against the demo fleet: ~30 questions, each compared
   with the number on the matching dashboard screen. Read-only — local dev uses
   the production database.

**Phase 2 — polish:** `/fleet/assistant` page with history, small charts in
answers (recharts), feedback review in the platform admin console, plan quotas
(`plans.ai_*` columns, like `api_enabled`), staff-money setting, GPS tools,
per-fleet time zone once Settings adds it.

**Phase 3 — actions & insights:** confirm-before-doing actions (create a
reminder, draft a message to a driver in Messages, start a settlement), weekly
"things to look at" digest, anomaly alerts — the `/ai` roadmap.

## 8. Coordination with other sessions

| Area | Other session | Arrangement |
|---|---|---|
| `app/fleet/layout.tsx`, `lib/settings/*`, `app/fleet/settings/*`, money formatting (`lib/money.ts`), FinancialsDashboard, LedgerWorkspace, workspaces, `financeRanges`, `settlementCalculations` | **Settings & preferences** (PR #15, running) | Assistant doesn't edit these. Backend is new files only; UI/money/settings wiring waits until #15 + currency reach `main`, then rebase. `assistant.*` setting keys are added by the assistant session after #15 merges. |
| `lib/modules/catalog.ts`, `components/fleet/navConfig.ts`, tracking pages, billing/checkout, Stripe webhook, `gps_*` tables | **GPS / tracking** (uncommitted on Frank's PC, will push to `main`) | Assistant adds its one module entry last and rebases after GPS lands. GPS tools only after `20261117_gps_trackers.sql` is applied. Doesn't touch GPS/tracking/billing files. |
| `FleetTopbar.tsx`, Messages | Messaging (done, live) | Launcher goes next to `MessagesButton`; no active conflict. |

**Shipping:** PR from `claude/adoring-pasteur-ksjrzo` → `main` (not `dev`, which
is stale), only when Frank says go. `main` auto-deploys rovora.eu via Coolify, so
the migration must be applied first.

**Build order with no waiting:** tools + route (new files) → wait for #15 →
drawer + launcher + module + settings → migration handed to Frank → beta.
