import { NextResponse } from 'next/server';
import { getPlans } from '@/lib/billing/plans-data';
import { buildKnowledge, SALES_EMAIL } from '@/lib/marketing/rovora-knowledge';

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
// =============================================================================

const MODEL = process.env.SUPPORT_CHAT_MODEL || 'gpt-4o-mini';
const MAX_MESSAGE_CHARS = 1500; // per message
const MAX_HISTORY = 16; // most recent turns we forward to the model
const MAX_OUTPUT_TOKENS = 600;

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
  // message (the Anthropic API requires that to generate a reply).
  const trimmed = cleaned.slice(-MAX_HISTORY);
  while (trimmed.length && trimmed[trimmed.length - 1].role !== 'user') trimmed.pop();
  return trimmed;
}

export async function POST(request: Request) {
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    request.headers.get('x-real-ip') ||
    'unknown';

  if (rateLimited(ip)) {
    return NextResponse.json(
      { reply: `You're sending messages a little fast — give it a moment, or email ${SALES_EMAIL} and a person will help.` },
      { status: 429 },
    );
  }

  let messages: ChatMsg[];
  try {
    const body = await request.json();
    messages = sanitize(body?.messages);
  } catch {
    return NextResponse.json({ reply: FALLBACK }, { status: 400 });
  }

  if (!messages.length) {
    return NextResponse.json({ reply: 'What would you like to know about Rovora?' });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    // Not configured yet — still useful, just routes to a human.
    return NextResponse.json({ reply: FALLBACK });
  }

  try {
    const plans = await getPlans();
    const system = buildKnowledge(plans);

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_OUTPUT_TOKENS,
        // OpenAI takes the knowledge base as a leading system message.
        messages: [{ role: 'system', content: system }, ...messages],
      }),
      // Don't let a slow upstream hang the visitor's UI.
      signal: AbortSignal.timeout(25_000),
    });

    if (!res.ok) {
      console.error('support-chat: OpenAI API error', res.status, await res.text().catch(() => ''));
      return NextResponse.json({ reply: FALLBACK });
    }

    const data = await res.json();
    const reply: string =
      (typeof data?.choices?.[0]?.message?.content === 'string'
        ? data.choices[0].message.content
        : ''
      ).trim();

    return NextResponse.json({ reply: reply || FALLBACK });
  } catch (err) {
    console.error('support-chat: request failed', err);
    return NextResponse.json({ reply: FALLBACK });
  }
}
