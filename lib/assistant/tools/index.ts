// =============================================================================
// ROVORA AI — the tool registry and the ONE place permissions are enforced
// =============================================================================
// The model is only ever shown tools this person may use (role + module), and
// every call is checked again here before it runs — the model could ask for a
// tool by name that it wasn't offered.
// =============================================================================

import type { AssistantContext, AssistantTool, Source, ToolResult } from '../types';
import type { ToolSpec } from '../openai';
import { OPS_TOOLS } from './ops';
import { MONEY_TOOLS } from './money';

export const ALL_TOOLS: AssistantTool[] = [...OPS_TOOLS, ...MONEY_TOOLS];

const BY_NAME = new Map(ALL_TOOLS.map((t) => [t.name, t]));

/** May this person use this tool for this fleet right now? */
export function toolAllowed(tool: AssistantTool, ctx: AssistantContext): boolean {
  if (!tool.roles.includes(ctx.role)) return false;
  if (tool.module && !ctx.modules.has(tool.module)) return false;
  return true;
}

export function toolsFor(ctx: AssistantContext): AssistantTool[] {
  return ALL_TOOLS.filter((t) => toolAllowed(t, ctx));
}

export function toolSpecs(tools: AssistantTool[]): ToolSpec[] {
  return tools.map((t) => ({
    type: 'function',
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }));
}

/** Largest tool result (characters of JSON) passed back to the model. */
const MAX_RESULT_CHARS = 12_000;
const TOOL_TIMEOUT_MS = 12_000;

export interface ToolRun {
  name: string;
  /** JSON string handed to the model. */
  content: string;
  sources: Source[];
  ok: boolean;
}

function safeSources(sources: Source[] | undefined): Source[] {
  return (sources ?? [])
    .filter((s) => s && typeof s.href === 'string' && /^\/fleet(\/[a-zA-Z0-9_-]+)*\/?(\?[a-zA-Z0-9_=&-]*)?$/.test(s.href))
    .map((s) => ({ label: String(s.label ?? '').slice(0, 80) || 'Open', href: s.href }))
    .slice(0, 8);
}

/** Run one model-requested tool call with every check applied. */
export async function runToolCall(ctx: AssistantContext, name: string, rawArgs: string): Promise<ToolRun> {
  const tool = BY_NAME.get(name);
  if (!tool) return { name, ok: false, sources: [], content: JSON.stringify({ error: `No tool called ${name}.` }) };
  if (!toolAllowed(tool, ctx)) {
    const why = !tool.roles.includes(ctx.role)
      ? 'This information is only available to fleet admins.'
      : `The ${tool.module} module is switched off for this fleet (it can be turned on in Integrations).`;
    return { name, ok: false, sources: [], content: JSON.stringify({ not_allowed: why }) };
  }

  let args: Record<string, unknown> = {};
  try {
    const parsed = rawArgs ? JSON.parse(rawArgs) : {};
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) args = parsed as Record<string, unknown>;
  } catch {
    return { name, ok: false, sources: [], content: JSON.stringify({ error: 'Arguments were not valid JSON.' }) };
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race<ToolResult>([
      tool.run(ctx, args),
      new Promise<ToolResult>((_, reject) => {
        timer = setTimeout(() => reject(new Error('timed out')), TOOL_TIMEOUT_MS);
      }),
    ]);
    let content = JSON.stringify(result.data ?? null);
    if (content.length > MAX_RESULT_CHARS) {
      content = JSON.stringify({
        note: 'Result was too large and has been cut. Ask for a narrower period or a single driver/vehicle for full detail.',
        partial: content.slice(0, MAX_RESULT_CHARS - 200),
      });
    }
    return { name, ok: true, sources: safeSources(result.sources), content };
  } catch (err) {
    console.error(`[assistant] tool ${name} failed:`, err);
    return { name, ok: false, sources: [], content: JSON.stringify({ error: 'That lookup failed. Try again or ask differently.' }) };
  } finally {
    clearTimeout(timer);
  }
}
