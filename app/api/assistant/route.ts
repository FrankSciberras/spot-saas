import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { isPlatformAdmin } from '@/lib/auth/platform';
import { createAdminClient } from '@/lib/supabase/server';
import { assistantRoleFor, buildAssistantContext, sanitizePage } from '@/lib/assistant/context';
import {
  assistantSwitchedOn,
  beginQuestion,
  deniedMessage,
  finishQuestion,
  getAssistantEntitlement,
  maxEurPerQuestion,
  monthBounds,
  platformMonthlyBudgetEur,
} from '@/lib/assistant/limits';
import { assistantModel, priceFor } from '@/lib/assistant/pricing';
import { streamChat } from '@/lib/assistant/openai';
import { runAssistant, type AssistantEvent } from '@/lib/assistant/run';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 120;

// =============================================================================
// ROVORA AI — FLEET ASSISTANT API
// =============================================================================
// POST /api/assistant   { question, conversation_id?, page? }
//   Signed-in fleet admins/staff only. Streams NDJSON, one event per line:
//     {"type":"start","conversation_id":"…"}
//     {"type":"status","text":"Checking bookkeeping…"}
//     {"type":"text","delta":"…"}          append to the answer
//     {"type":"discard"}                   drop the answer text so far
//     {"type":"done","message_id":"…","sources":[…],"usage":{…}}
//   Refusals (rate limit, allowance used up, plan, not enabled) come back as
//   JSON with an HTTP status and a `message` that is safe to show as-is.
//
// GET /api/assistant?secret=<CRON_SECRET>   live self-test (or platform admin)
//
// Switching it on, during beta: set FLEET_ASSISTANT_BETA_ORGS to a comma-
// separated list of organization ids ("*" = every fleet). The `assistant`
// module (lib/modules/catalog.ts) will replace this once the chat panel ships.
// Needs OPENAI_API_KEY (shared with the website chatbot) and migration
// supabase/migrations/20261118_fleet_assistant.sql.
// =============================================================================

const MAX_QUESTION_CHARS = 1000;
const HISTORY_TURNS = 10;
const HISTORY_CHARS = 2000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function refuse(status: number, reason: string, message: string) {
  return NextResponse.json(
    { error: reason, reason, message },
    { status, headers: { 'cache-control': 'private, no-store', 'x-assistant-reason': reason } },
  );
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return refuse(401, 'unauthorized', 'Please sign in again.');
  const role = assistantRoleFor(session);
  if (!role) return refuse(403, 'forbidden', 'Rovora AI is for fleet managers.');
  const organizationId = session.organization_id;

  let body: { question?: unknown; conversation_id?: unknown; page?: unknown };
  try {
    body = await request.json();
  } catch {
    return refuse(400, 'bad_request', 'Something went wrong sending that. Please try again.');
  }
  const question = typeof body.question === 'string' ? body.question.trim().slice(0, MAX_QUESTION_CHARS) : '';
  if (!question) return refuse(400, 'empty_question', 'Ask me anything about your fleet.');
  const requestedConversation =
    typeof body.conversation_id === 'string' && UUID.test(body.conversation_id) ? body.conversation_id.toLowerCase() : null;

  const ctx = await buildAssistantContext(session, role, sanitizePage(body.page));
  if (!assistantSwitchedOn(organizationId, ctx.modules)) {
    return refuse(403, 'not_enabled', 'Rovora AI isn’t switched on for your fleet yet.');
  }

  const entitlement = await getAssistantEntitlement(organizationId);
  if (!entitlement.enabled) {
    return refuse(403, entitlement.reason ?? 'plan_not_included', deniedMessage(entitlement.reason ?? 'plan_not_included', { isAdmin: ctx.isAdmin, entitlement }));
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  const model = assistantModel();
  const price = priceFor(model);
  if (!apiKey || !price) {
    console.error(`[assistant] not configured: ${!apiKey ? 'OPENAI_API_KEY missing' : `no price for model "${model}" (set FLEET_ASSISTANT_PRICE_USD)`}`);
    return refuse(503, 'not_configured', deniedMessage('not_set_up', { isAdmin: ctx.isAdmin, entitlement }));
  }

  const admin = createAdminClient();

  // ── Conversation: continue one this person owns, or start a new one ────────
  let conversationId: string | null = null;
  let history: { role: 'user' | 'assistant'; content: string }[] = [];
  if (requestedConversation) {
    const { data: conv } = await admin
      .from('assistant_conversations')
      .select('id')
      .eq('id', requestedConversation)
      .eq('organization_id', organizationId)
      .eq('user_id', session.id)
      .maybeSingle();
    if (conv) {
      conversationId = conv.id as string;
      const { data: past } = await admin
        .from('assistant_messages')
        .select('role, content')
        .eq('conversation_id', conversationId)
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false })
        .limit(HISTORY_TURNS);
      history = ((past ?? []) as { role: 'user' | 'assistant'; content: string }[])
        .reverse()
        .map((m) => ({ role: m.role, content: m.content.slice(0, HISTORY_CHARS) }));
    }
  }
  let startedNew = false;
  if (!conversationId) {
    startedNew = true;
    const { data: created, error } = await admin
      .from('assistant_conversations')
      .insert({ organization_id: organizationId, user_id: session.id, title: question.slice(0, 80) })
      .select('id')
      .single();
    if (error || !created) {
      console.error('[assistant] could not create conversation:', error);
      return refuse(503, 'not_set_up', deniedMessage('not_set_up', { isAdmin: ctx.isAdmin, entitlement }));
    }
    conversationId = created.id as string;
  }

  // ── The gate: rate limits + monthly allowance, reserved atomically ─────────
  const gate = await beginQuestion({ organizationId, userId: session.id, conversationId, entitlement });
  if (!gate.ok) {
    // Don't leave an empty chat behind for a question that never ran.
    if (startedNew) {
      await admin.from('assistant_conversations').delete().eq('id', conversationId).eq('organization_id', organizationId);
    }
    const status = gate.reason === 'error' || gate.reason === 'not_set_up' ? 503 : 429;
    return refuse(status, gate.reason, deniedMessage(gate.reason, { isAdmin: ctx.isAdmin, entitlement, resetsOn: monthBounds().resetsOn }));
  }

  await admin.from('assistant_messages').insert({
    conversation_id: conversationId,
    organization_id: organizationId,
    role: 'user',
    content: question,
    usage_id: gate.usageId,
  });

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true;
      const write = (obj: unknown) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(obj)}\n`));
        } catch {
          open = false; // the browser went away; keep going so usage is still recorded
        }
      };
      write({ type: 'start', conversation_id: conversationId });

      try {
        const outcome = await runAssistant({
          ctx,
          apiKey,
          model,
          price,
          history,
          question,
          maxEur: gate.reservedEur,
          emit: (ev: AssistantEvent) => write(ev),
          signal: request.signal,
        });

        await finishQuestion(gate.usageId, organizationId, outcome.stopped === 'upstream_error' ? 'failed' : 'done', outcome.totals);
        if (outcome.errorDetail) console.error(`[assistant] ${outcome.stopped} (model=${model}): ${outcome.errorDetail}`);

        const { data: saved } = await admin
          .from('assistant_messages')
          .insert({
            conversation_id: conversationId,
            organization_id: organizationId,
            role: 'assistant',
            content: outcome.answer,
            sources: outcome.sources,
            tools_used: outcome.toolsUsed,
            usage_id: gate.usageId,
          })
          .select('id')
          .single();
        await admin
          .from('assistant_conversations')
          .update({ updated_at: new Date().toISOString() })
          .eq('id', conversationId)
          .eq('organization_id', organizationId);

        const spent = gate.monthSpentEur + outcome.totals.costEur;
        const budget = entitlement.monthlyBudgetEur;
        write({
          type: 'done',
          message_id: saved?.id ?? null,
          sources: outcome.sources,
          usage: {
            percent_used: budget > 0 ? Math.min(100, Math.round((spent / budget) * 1000) / 10) : 100,
            resets_on: monthBounds().resetsOn,
            ...(ctx.isAdmin
              ? { question_cost_eur: Number(outcome.totals.costEur.toFixed(5)), spent_eur: Number(spent.toFixed(4)), budget_eur: budget }
              : {}),
          },
        });
      } catch (err) {
        console.error('[assistant] question failed:', err);
        // Unknown spend: keep the full reservation as the cost (never under-count).
        await finishQuestion(gate.usageId, organizationId, 'failed', {
          model,
          inputTokens: 0,
          cachedInputTokens: 0,
          outputTokens: 0,
          llmCalls: 0,
          toolCalls: 0,
          costEur: gate.reservedEur,
        });
        write({ type: 'discard' });
        write({ type: 'text', delta: 'Sorry — something went wrong answering that. Please try again.' });
        write({ type: 'done', message_id: null, sources: [] });
      } finally {
        if (open) {
          try {
            controller.close();
          } catch {
            /* already closed */
          }
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      'content-type': 'application/x-ndjson; charset=utf-8',
      'cache-control': 'private, no-store',
      'x-accel-buffering': 'no',
    },
  });
}

// ── GET: self-test ───────────────────────────────────────────────────────────
//   https://rovora.eu/api/assistant?secret=<CRON_SECRET>   (or as platform admin)

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  let authorized = false;
  if (secret) {
    const header = request.headers.get('authorization');
    if (header === `Bearer ${secret}` || new URL(request.url).searchParams.get('secret') === secret) authorized = true;
  }
  if (!authorized) authorized = await isPlatformAdmin();
  if (!authorized) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  const model = assistantModel();
  const price = priceFor(model);
  const config = {
    model,
    price_usd_per_1m_tokens: price,
    max_eur_per_question: maxEurPerQuestion(),
    platform_monthly_budget_eur: platformMonthlyBudgetEur(),
    beta_orgs: process.env.FLEET_ASSISTANT_BETA_ORGS ? process.env.FLEET_ASSISTANT_BETA_ORGS.split(',').length : 0,
    key_present: Boolean(apiKey),
  };

  // Is the migration applied? (The gate function is the piece everything needs.)
  const { error: migErr } = await createAdminClient().rpc('assistant_usage_summary', {
    p_org: '00000000-0000-0000-0000-000000000000',
  });
  const migrationApplied = !migErr;

  if (!apiKey || !price) {
    return NextResponse.json({
      ok: false,
      verdict: !apiKey
        ? 'OPENAI_API_KEY is not set in this container (Coolify → runtime variable → redeploy).'
        : `No price known for "${model}" — set FLEET_ASSISTANT_PRICE_USD="input,cached,output" (USD per 1M tokens) or pick a listed model.`,
      migration_applied: migrationApplied,
      ...config,
    });
  }

  const started = Date.now();
  const probe = await streamChat({
    apiKey,
    model,
    messages: [{ role: 'user', content: 'Reply with the single word: pong.' }],
    maxOutputTokens: 16,
  });
  const ms = Date.now() - started;
  return NextResponse.json({
    ok: probe.ok && migrationApplied,
    verdict: !probe.ok
      ? `${probe.reason}: ${probe.detail}`
      : migrationApplied
        ? `Working. ${model} answered in ${ms}ms.`
        : `${model} answered, but migration 20261118_fleet_assistant.sql is NOT applied (${migErr?.message}).`,
    migration_applied: migrationApplied,
    sample: probe.ok ? probe.content.slice(0, 40) : undefined,
    usage: probe.ok ? probe.usage : undefined,
    ...config,
  });
}
