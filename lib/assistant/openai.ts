// =============================================================================
// ROVORA AI — one streaming Chat Completions call with tool calling
// =============================================================================
// Raw fetch, no SDK — same approach as the website chatbot
// (app/api/support-chat/route.ts), so both behave alike when a key, model or
// quota goes wrong. Streams text deltas to `onText` as they arrive, collects
// tool calls, and returns the exact token usage OpenAI reports (needed for the
// euro budget).
// =============================================================================

const OPENAI_ENDPOINT = 'https://api.openai.com/v1/chat/completions';
const UPSTREAM_TIMEOUT_MS = 45_000;

export interface ToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export type ChatMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: ToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string };

export interface ToolSpec {
  type: 'function';
  function: { name: string; description: string; parameters: unknown };
}

export interface CallUsage {
  input: number;
  cachedInput: number;
  output: number;
}

export type CallResult =
  | {
      ok: true;
      content: string;
      toolCalls: ToolCall[];
      finishReason: string;
      /** null when OpenAI didn't report usage (caller must assume the worst). */
      usage: CallUsage | null;
    }
  | { ok: false; reason: string; detail: string; status?: number };

/** Explains an OpenAI HTTP status in terms of what to go fix (mirrors support-chat). */
export function explainStatus(status: number, body: string, model: string): { reason: string; hint: string } {
  const code = /"code"\s*:\s*"([^"]+)"/.exec(body)?.[1] ?? '';
  if (status === 401) return { reason: 'upstream_401_bad_key', hint: 'OpenAI rejected OPENAI_API_KEY (deleted, rotated or mistyped).' };
  if (status === 403) return { reason: 'upstream_403_forbidden', hint: `The key may not use "${model}".` };
  if (status === 404) return { reason: 'upstream_404_no_model', hint: `OpenAI has no model "${model}" — fix FLEET_ASSISTANT_MODEL.` };
  if (status === 429) {
    return code === 'insufficient_quota'
      ? { reason: 'upstream_429_no_credit', hint: 'The OpenAI account is out of credit — top up at platform.openai.com.' }
      : { reason: 'upstream_429_rate_limited', hint: 'OpenAI rate limit hit; usually transient.' };
  }
  if (status >= 500) return { reason: 'upstream_5xx', hint: 'OpenAI is having problems; retry shortly.' };
  return { reason: `upstream_${status}`, hint: `Unexpected response from OpenAI${code ? ` (${code})` : ''}.` };
}

export async function streamChat(opts: {
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  tools?: ToolSpec[];
  /** 'none' forces a text answer (used on the last allowed round). */
  toolChoice?: 'auto' | 'none';
  maxOutputTokens: number;
  onText?: (delta: string) => void;
  signal?: AbortSignal;
}): Promise<CallResult> {
  const body = (tokenField: 'max_tokens' | 'max_completion_tokens') =>
    JSON.stringify({
      model: opts.model,
      messages: opts.messages,
      ...(opts.tools?.length ? { tools: opts.tools, tool_choice: opts.toolChoice ?? 'auto', parallel_tool_calls: true } : {}),
      [tokenField]: opts.maxOutputTokens,
      stream: true,
      stream_options: { include_usage: true },
    });

  const signal = opts.signal
    ? AbortSignal.any([opts.signal, AbortSignal.timeout(UPSTREAM_TIMEOUT_MS)])
    : AbortSignal.timeout(UPSTREAM_TIMEOUT_MS);

  const post = (payload: string) =>
    fetch(OPENAI_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${opts.apiKey}` },
      body: payload,
      signal,
    });

  let res: Response;
  try {
    res = await post(body('max_tokens'));
    // Newer (reasoning) models reject max_tokens — retry once with the new field.
    if (res.status === 400) {
      const text = await res.text();
      if (text.includes('max_completion_tokens')) {
        res = await post(body('max_completion_tokens'));
      } else {
        const { reason, hint } = explainStatus(400, text, opts.model);
        return { ok: false, reason, detail: `${hint} — ${text.slice(0, 300)}`, status: 400 };
      }
    }
  } catch (err) {
    const name = err instanceof Error ? err.name : '';
    const timedOut = name === 'TimeoutError' || name === 'AbortError';
    return { ok: false, reason: timedOut ? 'upstream_timeout' : 'network_error', detail: String(err) };
  }

  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => '');
    const { reason, hint } = explainStatus(res.status, text, opts.model);
    return { ok: false, reason, detail: `${hint} — ${text.slice(0, 300)}`, status: res.status };
  }

  // ── Parse the SSE stream ────────────────────────────────────────────────────
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let content = '';
  let finishReason = '';
  let usage: CallUsage | null = null;
  const calls = new Map<number, ToolCall>();

  const handle = (payload: string) => {
    let frame: {
      choices?: {
        delta?: {
          content?: string | null;
          tool_calls?: { index: number; id?: string; function?: { name?: string; arguments?: string } }[];
        };
        finish_reason?: string | null;
      }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number; prompt_tokens_details?: { cached_tokens?: number } } | null;
    };
    try {
      frame = JSON.parse(payload);
    } catch {
      return; // a frame we can't parse isn't worth killing the reply over
    }
    const choice = frame.choices?.[0];
    const delta = choice?.delta;
    if (typeof delta?.content === 'string' && delta.content) {
      content += delta.content;
      opts.onText?.(delta.content);
    }
    for (const tc of delta?.tool_calls ?? []) {
      const cur = calls.get(tc.index) ?? { id: '', type: 'function' as const, function: { name: '', arguments: '' } };
      if (tc.id) cur.id = tc.id;
      if (tc.function?.name) cur.function.name += tc.function.name;
      if (tc.function?.arguments) cur.function.arguments += tc.function.arguments;
      calls.set(tc.index, cur);
    }
    if (choice?.finish_reason) finishReason = choice.finish_reason;
    if (frame.usage) {
      usage = {
        input: frame.usage.prompt_tokens ?? 0,
        cachedInput: frame.usage.prompt_tokens_details?.cached_tokens ?? 0,
        output: frame.usage.completion_tokens ?? 0,
      };
    }
  };

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        const t = line.trim();
        if (!t.startsWith('data:')) continue;
        const payload = t.slice(5).trim();
        if (payload && payload !== '[DONE]') handle(payload);
      }
    }
    const tail = buffer.trim();
    if (tail.startsWith('data:') && tail.slice(5).trim() !== '[DONE]') handle(tail.slice(5).trim());
  } catch (err) {
    // Died mid-stream. Report what we have; usage is unknown → caller charges the worst case.
    return { ok: false, reason: 'stream_aborted', detail: String(err) };
  }

  const toolCalls = [...calls.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, c]) => c)
    .filter((c) => c.id && c.function.name);
  return { ok: true, content, toolCalls, finishReason, usage };
}
