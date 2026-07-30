import { NextResponse } from 'next/server';
import { getPublicPlans } from '@/lib/billing/plans-data';
import { buildKnowledge, SALES_EMAIL } from '@/lib/marketing/rovora-knowledge';
import { isPlatformAdmin } from '@/lib/auth/platform';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// =============================================================================
// PUBLIC SUPPORT CHATBOT — landing-page assistant
// =============================================================================
// Answers visitor questions about Rovora using OpenAI (ChatGPT), grounded in the
// live product + pricing knowledge base (lib/marketing/rovora-knowledge). Public
// and unauthenticated, so it is deliberately defensive: short input caps, a small
// per-IP rate limit, and a graceful fallback that still points visitors to a
// real person if the API key is missing or the upstream call fails.
//
// Set OPENAI_API_KEY to enable live answers. Optionally override the model with
// SUPPORT_CHAT_MODEL (defaults to a fast, low-cost OpenAI model).
//
// DIAGNOSING A DEAD BOT
// The visitor must never see a stack trace, so every failure returns the same
// friendly FALLBACK text. That used to make the five very different causes
// (no key / revoked key / no credit / bad model / upstream down) indistinguish-
// able from the outside. Two things fix that now:
//   1. Every reply carries a short `reason` code — visible in the browser's
//      Network tab — so you can tell WHY a fallback was sent.
//   2. GET /api/support-chat?secret=<CRON_SECRET> runs a live self-test and
//      reports, in plain English, exactly what OpenAI said back.
// =============================================================================

const OPENAI_ENDPOINT = 'https://api.openai.com/v1/chat/completions';
const MODEL = process.env.SUPPORT_CHAT_MODEL || 'gpt-4o-mini';
const MAX_MESSAGE_CHARS = 1500; // per message
const MAX_HISTORY = 16; // most recent turns we forward to the model
const MAX_OUTPUT_TOKENS = 600;
const UPSTREAM_TIMEOUT_MS = 25_000;

// Honest fallback used whenever we can't produce a live answer — never leaves
// the visitor stranded; always routes them to a human.
const FALLBACK = `I can't reach the assistant right now, sorry about that. You can press "Talk to a real person" below to email our team at ${SALES_EMAIL}, and we'll get straight back to you. In the meantime you're welcome to start a free trial — no card required.`;

// Tiny in-memory rate limiter (best-effort; resets on redeploy). Caps abuse of
// a public, paid endpoint without needing external infrastructure.
const RATE_LIMIT = 20; // requests
const RATE_WINDOW_MS = 60_000; // per minute, per IP
const hits = new Map<string, { count: number; resetAt: number }>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const rec = hits.get(ip);
  if (!rec || now > rec.resetAt) {
    hits.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return false;
  }
  rec.count += 1;
  return rec.count > RATE_LIMIT;
}

type ChatMsg = { role: 'user' | 'assistant'; content: string };

function sanitize(messages: unknown): ChatMsg[] {
  if (!Array.isArray(messages)) return [];
  const cleaned: ChatMsg[] = [];
  for (const m of messages) {
    if (!m || typeof m !== 'object') continue;
    const role = (m as { role?: unknown }).role;
    const content = (m as { content?: unknown }).content;
    if ((role !== 'user' && role !== 'assistant') || typeof content !== 'string') continue;
    const text = content.trim().slice(0, MAX_MESSAGE_CHARS);
    if (text) cleaned.push({ role, content: text });
  }
  // Forward only the most recent turns, and make sure the thread ends on a user
  // message (the chat API requires that to generate a reply).
  const trimmed = cleaned.slice(-MAX_HISTORY);
  while (trimmed.length && trimmed[trimmed.length - 1].role !== 'user') trimmed.pop();
  return trimmed;
}

// ── Upstream call ────────────────────────────────────────────────────────────
// Returns either a reply or a short machine-readable reason for the failure, so
// the caller can log something useful instead of a bare "it didn't work".

type CallResult =
  | { ok: true; reply: string }
  | { ok: false; reason: string; detail: string };

/** Explains an OpenAI HTTP status in terms of what you actually have to go fix. */
function explainStatus(status: number, body: string): { reason: string; hint: string } {
  const code = /"code"\s*:\s*"([^"]+)"/.exec(body)?.[1] ?? '';
  if (status === 401) {
    return {
      reason: 'upstream_401_bad_key',
      hint: 'OpenAI rejected the API key. It has been deleted, rotated or mistyped — create a fresh key and update OPENAI_API_KEY, then REDEPLOY so the running container picks it up.',
    };
  }
  if (status === 403) {
    return {
      reason: 'upstream_403_forbidden',
      hint: `The key is valid but not allowed to use "${MODEL}" (project permissions, or the org needs verification for this model).`,
    };
  }
  if (status === 404) {
    return {
      reason: 'upstream_404_no_model',
      hint: `OpenAI has no model called "${MODEL}". Fix SUPPORT_CHAT_MODEL, or unset it to fall back to the default.`,
    };
  }
  if (status === 429) {
    return {
      reason: code === 'insufficient_quota' ? 'upstream_429_no_credit' : 'upstream_429_rate_limited',
      hint:
        code === 'insufficient_quota'
          ? 'The OpenAI account has run out of credit. Top up billing at platform.openai.com — the key itself is fine.'
          : 'Hitting OpenAI rate limits. Usually transient; persistent means the project tier is too low.',
    };
  }
  if (status >= 500) {
    return { reason: 'upstream_5xx', hint: 'OpenAI is having problems. Transient — retry shortly.' };
  }
  return { reason: `upstream_${status}`, hint: `Unexpected response from OpenAI${code ? ` (${code})` : ''}.` };
}

async function callOpenAI(apiKey: string, system: string, messages: ChatMsg[]): Promise<CallResult> {
  // Newer OpenAI models reject `max_tokens` and demand `max_completion_tokens`.
  // Send the widely-supported field first, then retry once on the specific 400
  // so swapping SUPPORT_CHAT_MODEL to a newer model can't silently kill the bot.
  const body = (tokenField: 'max_tokens' | 'max_completion_tokens') =>
    JSON.stringify({
      model: MODEL,
      [tokenField]: MAX_OUTPUT_TOKENS,
      // OpenAI takes the knowledge base as a leading system message.
      messages: [{ role: 'system', content: system }, ...messages],
    });

  const post = (payload: string) =>
    fetch(OPENAI_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
      body: payload,
      // Don't let a slow upstream hang the visitor's UI.
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });

  let res: Response;
  try {
    res = await post(body('max_tokens'));
    if (res.status === 400) {
      const text = await res.text();
      if (text.includes('max_completion_tokens')) {
        res = await post(body('max_completion_tokens'));
      } else {
        const { reason, hint } = explainStatus(400, text);
        return { ok: false, reason, detail: `${hint} — ${text.slice(0, 400)}` };
      }
    }
  } catch (err) {
    const name = err instanceof Error ? err.name : '';
    const timedOut = name === 'TimeoutError' || name === 'AbortError';
    return {
      ok: false,
      reason: timedOut ? 'upstream_timeout' : 'network_error',
      detail: timedOut
        ? `OpenAI did not respond within ${UPSTREAM_TIMEOUT_MS / 1000}s.`
        : `Could not reach api.openai.com — check outbound network/DNS from the server. ${String(err)}`,
    };
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const { reason, hint } = explainStatus(res.status, text);
    return { ok: false, reason, detail: `${hint} — ${text.slice(0, 400)}` };
  }

  const data = await res.json().catch(() => null);
  const reply: string =
    (typeof data?.choices?.[0]?.message?.content === 'string' ? data.choices[0].message.content : '').trim();

  if (!reply) {
    const finish = data?.choices?.[0]?.finish_reason ?? 'unknown';
    return {
      ok: false,
      reason: 'empty_reply',
      detail: `OpenAI returned 200 but no text (finish_reason: ${finish}). If this says "length", the token budget is too small for the system prompt.`,
    };
  }
  return { ok: true, reply };
}

// ── POST: the visitor-facing chat ────────────────────────────────────────────

export async function POST(request: Request) {
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    request.headers.get('x-real-ip') ||
    'unknown';

  if (rateLimited(ip)) {
    return NextResponse.json(
      {
        reply: `You're sending messages a little fast — give it a moment, or email ${SALES_EMAIL} and a person will help.`,
        reason: 'rate_limited',
      },
      { status: 429 },
    );
  }

  let messages: ChatMsg[];
  try {
    const body = await request.json();
    messages = sanitize(body?.messages);
  } catch {
    return NextResponse.json({ reply: FALLBACK, reason: 'bad_request_body' }, { status: 400 });
  }

  if (!messages.length) {
    return NextResponse.json({ reply: 'What would you like to know about Rovora?', reason: 'ok_empty' });
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    // Not configured — the assistant can't answer, so route to a human. Logged
    // (not silent) so a missing key in prod is obvious in the server logs. Set
    // OPENAI_API_KEY in the deploy environment (Coolify) to enable live answers,
    // as a RUNTIME variable, then redeploy.
    console.warn('[support-chat] OPENAI_API_KEY is not set — returning human-handoff fallback.');
    return NextResponse.json({ reply: FALLBACK, reason: 'no_api_key' });
  }

  // Public endpoint: read the catalogue without touching cookies.
  const plans = await getPublicPlans();
  const result = await callOpenAI(apiKey, buildKnowledge(plans), messages);

  if (!result.ok) {
    console.error(`[support-chat] ${result.reason} (model=${MODEL}): ${result.detail}`);
    return NextResponse.json({ reply: FALLBACK, reason: result.reason });
  }
  return NextResponse.json({ reply: result.reply, reason: 'ok' });
}

// ── GET: self-test ───────────────────────────────────────────────────────────
// Live end-to-end check of the chatbot's plumbing, in plain English.
//
//   https://rovora.eu/api/support-chat?secret=<CRON_SECRET>
//
// Guarded exactly like the cron routes (shared secret, or a signed-in platform
// admin) — it reports config state, so it is never left open to the public.

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  let authorized = false;
  if (secret) {
    const header = request.headers.get('authorization');
    const url = new URL(request.url);
    if (header === `Bearer ${secret}` || url.searchParams.get('secret') === secret) authorized = true;
  }
  if (!authorized) authorized = await isPlatformAdmin();
  if (!authorized) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const raw = process.env.OPENAI_API_KEY;
  const apiKey = raw?.trim();

  const key = {
    present: Boolean(apiKey),
    // Enough to identify WHICH key is loaded, never enough to use it.
    looksLike: apiKey ? `${apiKey.slice(0, 8)}…${apiKey.slice(-4)} (${apiKey.length} chars)` : null,
    hasStrayWhitespace: Boolean(raw && raw !== raw.trim()),
  };

  if (!apiKey) {
    return NextResponse.json({
      ok: false,
      verdict:
        'OPENAI_API_KEY is NOT set in this running container. Add it in Coolify as a RUNTIME variable (not a build variable), then redeploy — env changes only reach the app after a restart.',
      key,
      model: MODEL,
    });
  }

  const started = Date.now();
  const probe = await callOpenAI(apiKey, 'Reply with the single word: pong.', [
    { role: 'user', content: 'ping' },
  ]);
  const ms = Date.now() - started;

  if (probe.ok) {
    return NextResponse.json({
      ok: true,
      verdict: `Working. OpenAI answered in ${ms}ms using "${MODEL}". If visitors still see the fallback, the failure is intermittent — check the container logs for lines starting with [support-chat].`,
      key,
      model: MODEL,
      sample: probe.reply.slice(0, 120),
    });
  }

  return NextResponse.json({
    ok: false,
    verdict: probe.detail,
    reason: probe.reason,
    key,
    model: MODEL,
    tookMs: ms,
  });
}
