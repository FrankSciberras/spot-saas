// =============================================================================
// ROVORA AI — the question loop (model → tools → model → answer)
// =============================================================================
// Budget-aware by construction: before EVERY model call it works out the most
// that call could cost (pessimistic token estimate × price) and refuses to make
// it if the question would go over its reserved allowance. Real usage reported
// by OpenAI is then added up, so the ledger records what was actually spent.
// =============================================================================

import { buildSystemPrompt } from './prompt';
import { streamChat, type ChatMessage } from './openai';
import { costEur, estimateTokens, type ModelPrice } from './pricing';
import { runToolCall, toolSpecs, toolsFor } from './tools';
import type { QuestionTotals } from './limits';
import type { AssistantContext, Source } from './types';

/** Events streamed to the browser while a question is answered. */
export type AssistantEvent =
  | { type: 'status'; text: string }
  | { type: 'text'; delta: string }
  /** Drop the text streamed so far for this turn — the model went on to look things up. */
  | { type: 'discard' };

export interface RunOutcome {
  answer: string;
  sources: Source[];
  toolsUsed: string[];
  totals: QuestionTotals;
  /** Set when the question ended early for a reason worth logging. */
  stopped?: 'question_budget' | 'upstream_error' | 'empty';
  errorDetail?: string;
}

const MAX_ROUNDS = 5; // model calls per question (the last one may not call tools)
const MAX_OUTPUT_TOKENS = 900;
const MAX_TOOL_CALLS_PER_ROUND = 6;

export const ASSISTANT_FALLBACK =
  'Sorry — I couldn’t reach Rovora AI just now. Please try again in a moment. Everything in the dashboard still works as normal.';

export async function runAssistant(opts: {
  ctx: AssistantContext;
  apiKey: string;
  model: string;
  price: ModelPrice;
  /** Earlier turns of this conversation (text only). */
  history: { role: 'user' | 'assistant'; content: string }[];
  question: string;
  /** Hard ceiling for this one question, in euros (what was reserved). */
  maxEur: number;
  emit: (event: AssistantEvent) => void;
  signal?: AbortSignal;
}): Promise<RunOutcome> {
  const { ctx, price, maxEur, emit } = opts;
  const tools = toolsFor(ctx);
  const specs = toolSpecs(tools);
  const specsChars = JSON.stringify(specs).length;
  const statusFor = new Map(tools.map((t) => [t.name, t.status]));

  const messages: ChatMessage[] = [
    { role: 'system', content: buildSystemPrompt(ctx) },
    ...opts.history.map((m) => ({ role: m.role, content: m.content }) as ChatMessage),
    { role: 'user', content: opts.question },
  ];

  const totals: QuestionTotals = {
    model: opts.model,
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
    llmCalls: 0,
    toolCalls: 0,
    costEur: 0,
  };
  const sources: Source[] = [];
  const toolsUsed = new Set<string>();

  const charge = (u: { input: number; cachedInput: number; output: number }) => {
    totals.inputTokens += u.input;
    totals.cachedInputTokens += u.cachedInput;
    totals.outputTokens += u.output;
    totals.costEur += costEur(price, u);
  };

  const done = (answer: string, extra: Partial<RunOutcome> = {}): RunOutcome => {
    const seen = new Set<string>();
    return {
      answer,
      sources: sources.filter((s) => (seen.has(s.href) ? false : (seen.add(s.href), true))).slice(0, 8),
      toolsUsed: [...toolsUsed],
      totals,
      ...extra,
    };
  };

  // What the previous call really measured, so the next estimate can't fall
  // below reality as the conversation grows.
  let lastChars = 0;
  let lastInputTokens = 0;

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const lastRound = round === MAX_ROUNDS - 1;

    // Worst case for this call: every prompt character at ~3 chars/token (or
    // the last real count plus the new text, if higher), none of it cached,
    // and the full output allowance used.
    const chars = JSON.stringify(messages).length + specsChars;
    const promptTokens = Math.max(estimateTokens(chars), lastInputTokens + estimateTokens(chars - lastChars));
    const worstCase = costEur(price, { input: promptTokens, cachedInput: 0, output: MAX_OUTPUT_TOKENS });
    if (totals.costEur + worstCase > maxEur) {
      const msg =
        round === 0
          ? 'That conversation has got too long for one answer. Start a new chat and ask again.'
          : 'I looked up a lot of data but this question needs more than one answer allows. Try narrowing it down — one month, or one driver or vehicle.';
      if (round > 0) emit({ type: 'discard' });
      emit({ type: 'text', delta: msg });
      return done(msg, { stopped: 'question_budget' });
    }

    let streamed = false;
    const result = await streamChat({
      apiKey: opts.apiKey,
      model: opts.model,
      messages,
      tools: specs,
      toolChoice: lastRound ? 'none' : 'auto',
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      signal: opts.signal,
      onText: (delta) => {
        streamed = true;
        emit({ type: 'text', delta });
      },
    });
    totals.llmCalls += 1;

    if (!result.ok) {
      // A stream that died part-way may still have been billed: charge the worst case.
      if (result.reason === 'stream_aborted') charge({ input: promptTokens, cachedInput: 0, output: MAX_OUTPUT_TOKENS });
      if (streamed) emit({ type: 'discard' });
      emit({ type: 'text', delta: ASSISTANT_FALLBACK });
      return done(ASSISTANT_FALLBACK, { stopped: 'upstream_error', errorDetail: `${result.reason}: ${result.detail}` });
    }

    const used = result.usage ?? { input: promptTokens, cachedInput: 0, output: MAX_OUTPUT_TOKENS };
    charge(used);
    lastChars = chars;
    lastInputTokens = used.input;

    const calls = lastRound ? [] : result.toolCalls.slice(0, MAX_TOOL_CALLS_PER_ROUND);
    if (calls.length === 0) {
      const answer = result.content.trim();
      if (!answer) {
        const msg = 'I couldn’t put an answer together for that. Could you ask it another way?';
        emit({ type: 'text', delta: msg });
        return done(msg, { stopped: 'empty' });
      }
      return done(answer);
    }

    // The model wants data. Drop any text it wrote before deciding that.
    if (streamed) emit({ type: 'discard' });
    messages.push({ role: 'assistant', content: result.content || null, tool_calls: calls });

    const statuses = new Set(calls.map((c) => statusFor.get(c.function.name) ?? 'Looking that up…'));
    for (const text of statuses) emit({ type: 'status', text });

    const runs = await Promise.all(calls.map((c) => runToolCall(ctx, c.function.name, c.function.arguments)));
    runs.forEach((run, i) => {
      messages.push({ role: 'tool', tool_call_id: calls[i].id, content: run.content });
      if (run.ok) {
        toolsUsed.add(run.name);
        sources.push(...run.sources);
      }
    });
    totals.toolCalls += calls.length;
  }

  // Unreachable in practice (the last round can't call tools), but never leave the user hanging.
  const msg = 'I couldn’t finish that one. Try asking a narrower question.';
  emit({ type: 'text', delta: msg });
  return done(msg, { stopped: 'empty' });
}
