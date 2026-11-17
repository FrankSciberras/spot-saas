// =============================================================================
// ROVORA AI — FLEET ASSISTANT: shared types
// =============================================================================
// The assistant answers a fleet manager's questions by calling TOOLS: small,
// typed, read-only functions that query this fleet's data on the server. The
// model never writes SQL and never sees a row the person asking couldn't open
// in the dashboard. Every tool follows the same contract (AssistantTool below)
// so the safety checks — role, module, organization scope — live in one place
// (lib/assistant/tools/index.ts) and can't be forgotten by an individual tool.
// =============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';

/** Who is asking. Drivers never reach the assistant; driver+also_staff counts as staff. */
export type AssistantRole = 'admin' | 'staff';

export interface AssistantPage {
  /** The /fleet path the person is looking at, e.g. "/fleet/drivers/abc". */
  path: string;
  /** The record on that page, when there is one ("this driver", "this car"). */
  entity?: { type: 'driver' | 'vehicle'; id: string };
}

/**
 * Everything a tool needs to answer for ONE fleet and ONE person.
 *
 * SCOPING RULE (non-negotiable): every query a tool runs MUST include
 * `.eq('organization_id', ctx.orgId)` — RLS alone only narrows reads to "any
 * fleet this user belongs to", which merges a multi-fleet manager's fleets.
 * scripts/check-api-isolation.js fails the build on a `.from()` without it.
 */
export interface AssistantContext {
  orgId: string;
  orgName: string;
  userId: string;
  userName: string | null;
  role: AssistantRole;
  isAdmin: boolean;
  /** Product modules this fleet has switched on (lib/modules/catalog keys). */
  modules: Set<string>;
  /** Cookie-bound client: RLS applies. Use this by default. */
  db: SupabaseClient;
  /**
   * Service-role client (bypasses RLS). ONLY for tables that are service-role
   * only (bolt_*), and still always filtered by organization_id.
   */
  admin: () => SupabaseClient;
  /** IANA time zone the dashboard buckets days in (e.g. Europe/Malta). */
  timeZone: string;
  /** Today's date (YYYY-MM-DD) in the fleet's time zone. */
  today: string;
  /** The fleet's currency. Tools return plain numbers; the model formats them. */
  currency: { code: string; symbol: string };
  page?: AssistantPage;
}

/** A link to the dashboard page behind an answer. `href` must start with /fleet/. */
export interface Source {
  label: string;
  href: string;
}

export interface ToolResult {
  /**
   * Compact, PII-free JSON for the model: names, plates, dates, counts and
   * amounts. Never ID-card / licence numbers, phone, email, address or photos.
   * Keep it small — cap lists (see `capList`) and say when they were cut.
   */
  data: unknown;
  /** Dashboard pages the answer can cite ("Sources"). */
  sources?: Source[];
}

/** JSON Schema for a tool's arguments (OpenAI function-calling format). */
export interface ToolParameters {
  type: 'object';
  properties: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean;
}

export interface AssistantTool {
  /** snake_case, unique. This is what the model calls. */
  name: string;
  /** Short line shown in the chat while it runs, e.g. "Checking bookkeeping…". */
  status: string;
  /** Tells the model WHEN to use this tool and what it returns. */
  description: string;
  parameters: ToolParameters;
  /** Who may use it. Money tools are ['admin'] only. */
  roles: AssistantRole[];
  /** Module that must be switched on for this fleet, if any. */
  module?: string;
  /**
   * Run the lookup. `args` comes from the model: treat it as untrusted input
   * and read it through the helpers in tools/args.ts. Throwing is fine — the
   * runner turns it into a short error the model can relay.
   */
  run(ctx: AssistantContext, args: Record<string, unknown>): Promise<ToolResult>;
}
