// =============================================================================
// Driver adjustment helpers
// =============================================================================
// One source of truth for the adjustment sign convention, shared by the
// settlement API (freezing), the fleet workspace, and the PDF export so the
// number can never drift between where it's computed and where it's shown.

import type { AdjustmentType } from '@/lib/types/database';

/**
 * Signed contribution of an adjustment to a driver's payable balance:
 *   expense / deduction      → negative (driver owes / is charged),
 *   bonus / reimbursement    → positive (driver is paid),
 *   other                    → zero (informational only).
 */
export function signedAdjustmentAmount(type: AdjustmentType, amount: number): number {
  const value = Number(amount) || 0;
  if (type === 'expense' || type === 'deduction') return -value;
  if (type === 'bonus' || type === 'reimbursement') return value;
  return 0;
}

/** Net signed total of a list of adjustments. */
export function calculateAdjustmentsNet(
  adjustments: Array<{ type: AdjustmentType; amount: number }>
): number {
  return adjustments.reduce((sum, adj) => sum + signedAdjustmentAmount(adj.type, adj.amount), 0);
}
