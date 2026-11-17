// =============================================================================
// ROVORA AI — what a question costs, in euros
// =============================================================================
// Every LLM call reports how many tokens it used; this turns that into euros so
// the monthly allowance (plans.ai_monthly_budget_eur) is counted in real money.
//
// PRICES: OpenAI list prices in US dollars per 1M tokens, standard tier. Last
// checked 2026-11-17 against public price lists; confirm at
// https://developers.openai.com/api/docs/pricing when changing model. If the
// configured model isn't in this table and no override is set, the assistant
// REFUSES to run — it can't enforce a euro budget for a price it doesn't know.
//
// Overrides (env, no redeploy of code needed):
//   FLEET_ASSISTANT_PRICE_USD   "input,cached_input,output" per 1M tokens for
//                               the configured model, e.g. "0.40,0.10,1.60"
//   FLEET_ASSISTANT_USD_TO_EUR  exchange rate (default 1.0 — deliberately
//                               pessimistic: €1 ≥ $1, so fleets hit their limit
//                               slightly early rather than ever overspending)
// =============================================================================

export interface ModelPrice {
  /** USD per 1M uncached input tokens. */
  input: number;
  /** USD per 1M cached input tokens. */
  cachedInput: number;
  /** USD per 1M output tokens (incl. reasoning tokens on reasoning models). */
  output: number;
}

const PRICES_USD_PER_MTOK: Record<string, ModelPrice> = {
  'gpt-4.1-nano': { input: 0.1, cachedInput: 0.025, output: 0.4 },
  'gpt-4.1-mini': { input: 0.4, cachedInput: 0.1, output: 1.6 },
  'gpt-4.1': { input: 2.0, cachedInput: 0.5, output: 8.0 },
  'gpt-4o-mini': { input: 0.15, cachedInput: 0.075, output: 0.6 },
  'gpt-4o': { input: 2.5, cachedInput: 1.25, output: 10.0 },
  'gpt-5-nano': { input: 0.05, cachedInput: 0.005, output: 0.4 },
  'gpt-5-mini': { input: 0.25, cachedInput: 0.025, output: 2.0 },
  'gpt-5': { input: 1.25, cachedInput: 0.125, output: 10.0 },
};

/** The model the assistant uses. Fast, cheap, good at tool calling. */
export const DEFAULT_ASSISTANT_MODEL = 'gpt-4.1-mini';

export function assistantModel(): string {
  return process.env.FLEET_ASSISTANT_MODEL?.trim() || DEFAULT_ASSISTANT_MODEL;
}

function usdToEur(): number {
  const v = Number(process.env.FLEET_ASSISTANT_USD_TO_EUR);
  return Number.isFinite(v) && v > 0 && v < 5 ? v : 1.0;
}

/**
 * Price for a model: the env override first, else the longest table key that
 * the model id starts with (so dated ids like "gpt-4.1-mini-2025-04-14" match).
 * null = unknown → the assistant must not run.
 */
export function priceFor(model: string): ModelPrice | null {
  const override = process.env.FLEET_ASSISTANT_PRICE_USD?.split(',').map((s) => Number(s.trim()));
  if (override && override.length === 3 && override.every((n) => Number.isFinite(n) && n >= 0)) {
    return { input: override[0], cachedInput: override[1], output: override[2] };
  }
  const key = Object.keys(PRICES_USD_PER_MTOK)
    .filter((k) => model === k || model.startsWith(`${k}-`))
    .sort((a, b) => b.length - a.length)[0];
  return key ? PRICES_USD_PER_MTOK[key] : null;
}

export interface TokenUsage {
  /** All input tokens, INCLUDING cached ones (OpenAI's prompt_tokens). */
  input: number;
  /** The cached part of `input`. */
  cachedInput: number;
  output: number;
}

/** Euros for one or more calls' worth of tokens. */
export function costEur(price: ModelPrice, usage: TokenUsage): number {
  const cached = Math.min(usage.cachedInput, usage.input);
  const usd =
    ((usage.input - cached) * price.input + cached * price.cachedInput + usage.output * price.output) / 1_000_000;
  return usd * usdToEur();
}

/**
 * Pessimistic token estimate for text we're about to send (~3 characters per
 * token; real English/JSON averages closer to 4). Used to make sure a call can
 * never cost more than what's left of the question's allowance.
 */
export function estimateTokens(chars: number): number {
  return Math.ceil(chars / 3);
}
