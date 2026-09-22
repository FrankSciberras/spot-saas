// =============================================================================
// PUBLIC API — REFERENCE CONTENT (single source of truth)
// =============================================================================
// This file describes the v1 surface ONCE. Two things read it:
//
//   * /docs/api          — the human documentation page
//   * /api/v1/openapi.json — the machine spec (Postman, Insomnia, codegen)
//
// Keeping both off one definition is the only way they stay in step; a docs
// page that has drifted from the API is worse than no docs page. When you add
// an endpoint, add it here in the same commit.
//
// Client-safe: no server imports, so the docs page can stay prerendered.
// =============================================================================

import type { ApiScope } from './scopes';

export const API_VERSION = 'v1';
export const API_BASE_PATH = '/api/v1';

export interface DocParam {
  name: string;
  type: string;
  required?: boolean;
  description: string;
}

export interface DocField {
  name: string;
  type: string;
  required?: boolean;
  description: string;
}

export interface DocEndpoint {
  /** Anchor id, e.g. 'list-drivers'. */
  id: string;
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  /** Path after the base, e.g. '/drivers/{id}'. */
  path: string;
  summary: string;
  description: string;
  /** null = any live key (only /me). */
  scope: ApiScope | null;
  query?: DocParam[];
  body?: DocField[];
  /** Example request body, pretty-printed JSON. */
  requestExample?: string;
  /** Example success response, pretty-printed JSON. */
  responseExample?: string;
  /** Success status, when it isn't 200. */
  successStatus?: number;
}

export interface DocSection {
  id: string;
  title: string;
  blurb: string;
  endpoints: DocEndpoint[];
}

// ── Shared parameter sets ───────────────────────────────────────────────────

const PAGINATION: DocParam[] = [
  { name: 'limit', type: 'integer', description: 'Rows per page, 1–200. Defaults to 50.' },
  { name: 'offset', type: 'integer', description: 'Rows to skip. Defaults to 0.' },
];

const UPDATED_SINCE: DocParam = {
  name: 'updated_since',
  type: 'string (ISO 8601)',
  description:
    'Only records changed at or after this timestamp. Store the time of your last sync and pass it here to pull just the changes.',
};

// ── Sections ────────────────────────────────────────────────────────────────

export const DOC_SECTIONS: DocSection[] = [
  {
    id: 'account',
    title: 'Account',
    blurb: 'Confirm a key works and find out what it is allowed to do.',
    endpoints: [
      {
        id: 'get-me',
        method: 'GET',
        path: '/me',
        summary: 'Who am I?',
        description:
          'Returns the fleet the key belongs to, the plan in force, the scopes the key holds and which product modules are switched on. Callable with any live key regardless of scope — make this your first call when wiring up an integration.',
        scope: null,
        responseExample: `{
  "data": {
    "organization": { "id": "8f14…", "name": "Sciberras Fleet", "slug": "sciberras-fleet" },
    "plan": { "key": "scale", "name": "Fleet" },
    "key": {
      "id": "c0de…",
      "name": "Payroll sync",
      "prefix": "rvk_live_7f2a9c31",
      "created_at": "2026-09-22T09:14:03.221Z",
      "expires_at": null,
      "last_used_at": "2026-09-22T11:02:55.010Z"
    },
    "scopes": ["drivers:read", "financials:read"],
    "enabled_modules": ["bookkeeping", "maintenance", "settlements"],
    "rate_limit": { "per_minute": "120", "per_day": "50000" }
  }
}`,
      },
    ],
  },
  {
    id: 'drivers',
    title: 'Drivers',
    blurb:
      'Your driver records: contact details, employment type, licence and document expiry dates, and which vehicle each one is on.',
    endpoints: [
      {
        id: 'list-drivers',
        method: 'GET',
        path: '/drivers',
        summary: 'List drivers',
        description: 'Every driver in the fleet, filtered and paginated.',
        scope: 'drivers:read',
        query: [
          { name: 'status', type: 'string', description: 'active | inactive' },
          { name: 'employment_type', type: 'string', description: 'full_time | part_time | terminated' },
          { name: 'assigned_vehicle_id', type: 'uuid', description: 'Only drivers on this vehicle.' },
          { name: 'search', type: 'string', description: 'Matches name or phone number.' },
          UPDATED_SINCE,
          {
            name: 'sort',
            type: 'string',
            description: 'full_name | created_at | updated_at | status. Prefix with "-" to reverse. Defaults to full_name.',
          },
          ...PAGINATION,
        ],
        responseExample: `{
  "data": [
    {
      "id": "3b1c…",
      "full_name": "Marco Vella",
      "phone": "+356 7900 1234",
      "address": "12 Triq il-Kbira, Birkirkara",
      "status": "active",
      "employment_type": "full_time",
      "user_id": "9ae2…",
      "assigned_vehicle_id": "7d40…",
      "id_card_number": "0123456M",
      "id_card_expiry_date": "2029-04-11",
      "police_conduct_expiry_date": "2027-01-30",
      "driving_license_number": "MT-448192",
      "driving_license_expiry_date": "2028-06-01",
      "tag_license_expiry_date": "2027-03-15",
      "notes": null,
      "created_at": "2026-02-11T08:00:00.000Z",
      "updated_at": "2026-09-19T15:22:41.884Z"
    }
  ],
  "meta": { "limit": 50, "offset": 0, "total": 38, "has_more": false }
}`,
      },
      {
        id: 'get-driver',
        method: 'GET',
        path: '/drivers/{id}',
        summary: 'Retrieve a driver',
        description: 'One driver by id. Answers 404 for an id in another fleet — ids are never confirmed across tenants.',
        scope: 'drivers:read',
      },
      {
        id: 'create-driver',
        method: 'POST',
        path: '/drivers',
        summary: 'Create a driver',
        description:
          'Adds a driver record. Leave out user_id to create a record-only driver synced from your own system, or pass the id of an existing fleet member to link them to a Rovora login so they can use the driver app. Refused with 402 plan_limit when the fleet is at its plan’s driver cap.',
        scope: 'drivers:write',
        successStatus: 201,
        body: [
          { name: 'full_name', type: 'string', required: true, description: 'The driver’s name. Max 200 characters.' },
          { name: 'phone', type: 'string', description: 'Contact number.' },
          { name: 'address', type: 'string', description: 'Home address.' },
          { name: 'status', type: 'string', description: 'active | inactive. Defaults to active.' },
          { name: 'employment_type', type: 'string', description: 'full_time | part_time | terminated.' },
          { name: 'user_id', type: 'uuid', description: 'An existing member of this fleet to link the driver to. Cannot be changed later.' },
          { name: 'assigned_vehicle_id', type: 'uuid', description: 'A vehicle in this fleet.' },
          { name: 'id_card_number', type: 'string', description: 'National ID / residence card number.' },
          { name: 'id_card_expiry_date', type: 'date', description: 'YYYY-MM-DD. Feeds document-expiry reminders.' },
          { name: 'police_conduct_expiry_date', type: 'date', description: 'YYYY-MM-DD.' },
          { name: 'driving_license_number', type: 'string', description: 'Licence number.' },
          { name: 'driving_license_expiry_date', type: 'date', description: 'YYYY-MM-DD.' },
          { name: 'tag_license_expiry_date', type: 'date', description: 'YYYY-MM-DD.' },
          { name: 'notes', type: 'string', description: 'Free text, max 2000 characters.' },
        ],
        requestExample: `{
  "full_name": "Marco Vella",
  "phone": "+356 7900 1234",
  "employment_type": "full_time",
  "driving_license_number": "MT-448192",
  "driving_license_expiry_date": "2028-06-01"
}`,
      },
      {
        id: 'update-driver',
        method: 'PATCH',
        path: '/drivers/{id}',
        summary: 'Update a driver',
        description:
          'Changes only the fields you send; everything else is left alone. user_id cannot be changed — linking a driver to a login is an account operation and stays in the dashboard.',
        scope: 'drivers:write',
        body: [{ name: '…', type: 'any create field', description: 'Same fields as Create a driver, except user_id.' }],
        requestExample: `{ "status": "inactive", "notes": "On leave until October" }`,
      },
      {
        id: 'delete-driver',
        method: 'DELETE',
        path: '/drivers/{id}',
        summary: 'Delete a driver',
        description:
          'Removes a driver record and answers 204. Only drivers with no linked Rovora login can be deleted here: deleting someone’s account should take a person clicking a button, not a stray script, so a linked driver returns 409 conflict. To take a linked driver off the road, PATCH their status to "inactive".',
        scope: 'drivers:write',
        successStatus: 204,
      },
    ],
  },
  {
    id: 'vehicles',
    title: 'Vehicles',
    blurb: 'Your cars: registration, make and model, mileage, status and document expiry dates.',
    endpoints: [
      {
        id: 'list-vehicles',
        method: 'GET',
        path: '/vehicles',
        summary: 'List vehicles',
        description: 'Every vehicle in the fleet, filtered and paginated.',
        scope: 'vehicles:read',
        query: [
          { name: 'status', type: 'string', description: 'active | in_service | out_of_service' },
          { name: 'assigned_driver_id', type: 'uuid', description: 'Only vehicles assigned to this driver.' },
          { name: 'search', type: 'string', description: 'Matches registration, make or model.' },
          UPDATED_SINCE,
          {
            name: 'sort',
            type: 'string',
            description: 'registration_number | make | mileage | created_at | updated_at | status. Prefix with "-" to reverse.',
          },
          ...PAGINATION,
        ],
        responseExample: `{
  "data": [
    {
      "id": "7d40…",
      "registration_number": "JKL 442",
      "make": "Toyota",
      "model": "Corolla Hybrid",
      "year": 2023,
      "mileage": 84210,
      "status": "active",
      "assigned_driver_id": "3b1c…",
      "insurance_expiry_date": "2027-02-28",
      "road_license_expiry_date": "2027-01-15",
      "color": "White",
      "notes": null,
      "created_at": "2026-01-08T10:31:02.000Z",
      "updated_at": "2026-09-20T06:11:19.440Z"
    }
  ],
  "meta": { "limit": 50, "offset": 0, "total": 41, "has_more": false }
}`,
      },
      {
        id: 'get-vehicle',
        method: 'GET',
        path: '/vehicles/{id}',
        summary: 'Retrieve a vehicle',
        description: 'One vehicle by id.',
        scope: 'vehicles:read',
      },
      {
        id: 'create-vehicle',
        method: 'POST',
        path: '/vehicles',
        summary: 'Create a vehicle',
        description:
          'Adds a vehicle. Registration numbers are unique across Rovora, so a duplicate answers 409 conflict. Refused with 402 plan_limit at the plan’s vehicle cap.',
        scope: 'vehicles:write',
        successStatus: 201,
        body: [
          { name: 'registration_number', type: 'string', required: true, description: 'Number plate. Max 32 characters.' },
          { name: 'make', type: 'string', required: true, description: 'e.g. Toyota.' },
          { name: 'model', type: 'string', required: true, description: 'e.g. Corolla Hybrid.' },
          { name: 'year', type: 'integer', description: 'Model year.' },
          { name: 'mileage', type: 'integer', description: 'Current odometer reading. Defaults to 0.' },
          { name: 'status', type: 'string', description: 'active | in_service | out_of_service. Defaults to active.' },
          { name: 'assigned_driver_id', type: 'uuid', description: 'A driver in this fleet.' },
          { name: 'insurance_expiry_date', type: 'date', description: 'YYYY-MM-DD. Feeds document-expiry reminders.' },
          { name: 'road_license_expiry_date', type: 'date', description: 'YYYY-MM-DD.' },
          { name: 'color', type: 'string', description: 'Body colour.' },
          { name: 'notes', type: 'string', description: 'Free text, max 2000 characters.' },
        ],
        requestExample: `{
  "registration_number": "JKL 442",
  "make": "Toyota",
  "model": "Corolla Hybrid",
  "year": 2023,
  "mileage": 84210,
  "insurance_expiry_date": "2027-02-28"
}`,
      },
      {
        id: 'update-vehicle',
        method: 'PATCH',
        path: '/vehicles/{id}',
        summary: 'Update a vehicle',
        description:
          'Changes only the fields you send. The usual use is a nightly mileage push from a tracker: send just { "mileage": 84900 }.',
        scope: 'vehicles:write',
        body: [{ name: '…', type: 'any create field', description: 'Same fields as Create a vehicle.' }],
        requestExample: `{ "mileage": 84900 }`,
      },
      {
        id: 'delete-vehicle',
        method: 'DELETE',
        path: '/vehicles/{id}',
        summary: 'Delete a vehicle',
        description:
          'Removes a vehicle and answers 204. Money already spent on the car stays in the books — its transactions keep their amounts and simply lose the link. A vehicle with records that cannot be detached answers 409; set its status to "out_of_service" instead.',
        scope: 'vehicles:write',
        successStatus: 204,
      },
    ],
  },
  {
    id: 'financials',
    title: 'Financials',
    blurb:
      'The bookkeeping ledger — one dated line per expense or income event, the same records the Financials screen reports on. Requires the Bookkeeping module to be switched on for the fleet.',
    endpoints: [
      {
        id: 'list-categories',
        method: 'GET',
        path: '/financials/categories',
        summary: 'List categories',
        description:
          'Your chart of accounts. Every transaction needs a category_id, and the category’s kind (income or expense) is what gives a line its direction. Read this once and cache the ids.',
        scope: 'financials:read',
        query: [
          { name: 'kind', type: 'string', description: 'income | expense' },
          { name: 'include_inactive', type: 'boolean', description: 'true also returns retired categories.' },
        ],
        responseExample: `{
  "data": [
    { "id": "a11f…", "key": "fuel", "name": "Fuel", "kind": "expense", "is_active": true, "sort_order": 1 },
    { "id": "b22e…", "key": "uber", "name": "Uber payouts", "kind": "income", "is_active": true, "sort_order": 2 }
  ]
}`,
      },
      {
        id: 'list-transactions',
        method: 'GET',
        path: '/financials/transactions',
        summary: 'List transactions',
        description:
          'The ledger, newest first. Every report is a date-range query, so from and to are the parameters you will use most.',
        scope: 'financials:read',
        query: [
          { name: 'from', type: 'date', description: 'YYYY-MM-DD, inclusive.' },
          { name: 'to', type: 'date', description: 'YYYY-MM-DD, inclusive.' },
          { name: 'direction', type: 'string', description: 'income | expense' },
          { name: 'category_id', type: 'uuid', description: 'One category.' },
          { name: 'vehicle_id', type: 'uuid', description: 'Only lines filed against this vehicle.' },
          { name: 'driver_id', type: 'uuid', description: 'Only lines filed against this driver.' },
          { name: 'payment_method', type: 'string', description: 'cash | card | bank | other' },
          { name: 'search', type: 'string', description: 'Matches description or counterparty.' },
          { name: 'sort', type: 'string', description: 'txn_date | amount | created_at. Prefix with "-" to reverse. Defaults to -txn_date.' },
          ...PAGINATION,
        ],
        responseExample: `{
  "data": [
    {
      "id": "e5c7…",
      "txn_date": "2026-09-19",
      "amount": 68.40,
      "direction": "expense",
      "category_id": "a11f…",
      "category": { "id": "a11f…", "key": "fuel", "name": "Fuel", "kind": "expense" },
      "description": "Diesel — JKL 442",
      "counterparty": "Enemed Birkirkara",
      "payment_method": "card",
      "vehicle_id": "7d40…",
      "driver_id": null,
      "source": "manual",
      "has_receipt": true,
      "created_at": "2026-09-19T17:44:02.113Z",
      "updated_at": "2026-09-19T17:44:02.113Z"
    }
  ],
  "meta": { "limit": 50, "offset": 0, "total": 1284, "has_more": true }
}`,
      },
      {
        id: 'get-transaction',
        method: 'GET',
        path: '/financials/transactions/{id}',
        summary: 'Retrieve a transaction',
        description: 'One ledger line by id.',
        scope: 'financials:read',
      },
      {
        id: 'create-transaction',
        method: 'POST',
        path: '/financials/transactions',
        summary: 'Record a transaction',
        description:
          'Files one expense or income line. amount is always positive — whether it counts as money in or money out comes from the category, so there is no way to book an expense that accidentally reads as revenue. Lines created here look exactly like ones typed into Rovora and show up in the financial reports immediately.',
        scope: 'financials:write',
        successStatus: 201,
        body: [
          { name: 'category_id', type: 'uuid', required: true, description: 'A category from this fleet’s chart of accounts.' },
          { name: 'amount', type: 'number', required: true, description: 'Positive, up to 2 decimal places.' },
          { name: 'txn_date', type: 'date', description: 'The day the money moved, YYYY-MM-DD. Defaults to today.' },
          { name: 'description', type: 'string', description: 'What it was, e.g. "Diesel — JKL 442".' },
          { name: 'counterparty', type: 'string', description: 'Who it was paid to or received from.' },
          { name: 'payment_method', type: 'string', description: 'cash | card | bank | other. Defaults to card.' },
          { name: 'vehicle_id', type: 'uuid', description: 'File the cost against a vehicle.' },
          { name: 'driver_id', type: 'uuid', description: 'File the cost against a driver.' },
        ],
        requestExample: `{
  "txn_date": "2026-09-19",
  "category_id": "a11f…",
  "amount": 68.40,
  "description": "Diesel — JKL 442",
  "counterparty": "Enemed Birkirkara",
  "payment_method": "card",
  "vehicle_id": "7d40…"
}`,
      },
      {
        id: 'update-transaction',
        method: 'PATCH',
        path: '/financials/transactions/{id}',
        summary: 'Update a transaction',
        description:
          'Corrects a line. Lines Rovora posted itself from a recurring cost (source "recurring") are read-only here — they are regenerated on each posting run, so an edit would be undone. Change the recurring cost in Rovora instead.',
        scope: 'financials:write',
        body: [{ name: '…', type: 'any create field', description: 'Same fields as Record a transaction.' }],
        requestExample: `{ "amount": 70.00, "description": "Diesel — JKL 442 (corrected)" }`,
      },
      {
        id: 'delete-transaction',
        method: 'DELETE',
        path: '/financials/transactions/{id}',
        summary: 'Delete a transaction',
        description:
          'Removes a line from the books and answers 204. Any attached receipt image is deleted with it. Automatically-posted recurring lines are protected and answer 409.',
        scope: 'financials:write',
        successStatus: 204,
      },
      {
        id: 'financial-summary',
        method: 'GET',
        path: '/financials/summary',
        summary: 'Income, expenses and profit',
        description:
          'Totals for any date range with a per-category breakdown — one call instead of paging the whole ledger and adding it up yourself. Both dates are required: point it at a week, a month, or your 4-week pay cycle.',
        scope: 'financials:read',
        query: [
          { name: 'from', type: 'date', required: true, description: 'YYYY-MM-DD, inclusive.' },
          { name: 'to', type: 'date', required: true, description: 'YYYY-MM-DD, inclusive.' },
          { name: 'vehicle_id', type: 'uuid', description: 'Restrict the totals to one vehicle.' },
          { name: 'driver_id', type: 'uuid', description: 'Restrict the totals to one driver.' },
        ],
        responseExample: `{
  "data": {
    "from": "2026-09-01",
    "to": "2026-09-28",
    "income": 18420.50,
    "expenses": 11038.77,
    "net": 7381.73,
    "transaction_count": 214,
    "by_category": [
      { "category_id": "b22e…", "key": "uber", "name": "Uber payouts", "kind": "income", "total": 12900.00, "count": 4 },
      { "category_id": "a11f…", "key": "fuel", "name": "Fuel", "kind": "expense", "total": 3184.20, "count": 96 }
    ]
  },
  "meta": { "truncated": false, "max_transactions": 20000 }
}`,
      },
    ],
  },
];

/** Every endpoint, flattened — used by the OpenAPI generator. */
export const ALL_ENDPOINTS: DocEndpoint[] = DOC_SECTIONS.flatMap((s) => s.endpoints);

// ── Error catalogue (documented so clients can branch on `code`) ─────────────

export interface DocError {
  status: number;
  code: string;
  meaning: string;
}

export const DOC_ERRORS: DocError[] = [
  { status: 400, code: 'invalid_json', meaning: 'The body was missing, empty, or not a JSON object.' },
  { status: 401, code: 'unauthorized', meaning: 'No API key was sent.' },
  { status: 401, code: 'invalid_key', meaning: 'The key does not exist.' },
  { status: 401, code: 'key_revoked', meaning: 'The key was revoked in Rovora.' },
  { status: 401, code: 'key_expired', meaning: 'The key passed its expiry date.' },
  { status: 402, code: 'plan_limit', meaning: 'Adding this record would exceed the fleet’s plan cap. Upgrade, or remove something.' },
  { status: 403, code: 'insufficient_scope', meaning: 'The key does not hold the scope this endpoint needs.' },
  { status: 403, code: 'plan_upgrade_required', meaning: 'The fleet’s plan does not include API access.' },
  { status: 403, code: 'module_disabled', meaning: 'The product module behind this endpoint is switched off for the fleet.' },
  { status: 403, code: 'ip_not_allowed', meaning: 'The key has an IP allow-list and this address is not on it.' },
  { status: 403, code: 'account_suspended', meaning: 'The Rovora account is suspended or cancelled.' },
  { status: 404, code: 'not_found', meaning: 'No such record in this fleet. Also returned for ids that belong to another fleet.' },
  { status: 409, code: 'conflict', meaning: 'The write clashes with something that already exists, or the record is protected.' },
  { status: 413, code: 'payload_too_large', meaning: 'The request body exceeded 256 KB.' },
  { status: 422, code: 'validation_failed', meaning: 'One or more fields are invalid. `details.fields` names each one.' },
  { status: 429, code: 'rate_limited', meaning: 'Rate limit hit. Wait for the seconds in Retry-After.' },
  { status: 500, code: 'internal_error', meaning: 'Something failed on our side. Safe to retry.' },
];
