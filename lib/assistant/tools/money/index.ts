// Rovora AI — the money (and safety) tools: bookkeeping, vehicle costs,
// settlements, Bolt and driver safety. Role and module gates live on each
// tool and are enforced by the runner (lib/assistant/tools/index.ts).

import type { AssistantTool } from '../../types';
import { financeSummaryTool } from './finance';
import { vehicleCostsTool } from './vehicle-costs';
import { settlementsSummaryTool } from './settlements';
import { boltStatsTool } from './bolt';
import { safetySummaryTool } from './safety';

export const MONEY_TOOLS: AssistantTool[] = [
  financeSummaryTool,
  vehicleCostsTool,
  settlementsSummaryTool,
  boltStatsTool,
  safetySummaryTool,
];
