// =============================================================================
// Driver safety scoring (v1)
//
// One place for the formula so the /fleet/safety page and the weekly report
// cron can never disagree. Inputs are event counts over a period plus distance
// driven; output is 0–100 (100 = clean record).
//
// The score is events-per-distance based: the weighted event count is
// normalised per 100 km so a driver doing 900 km/week isn't punished for
// having more absolute events than one doing 90 km. The MIN_KM floor stops a
// tiny sample (2 km driven, 1 event) from cratering the score.
// Weights are a starting point — tune once real data comes in.
// =============================================================================

export interface SafetyEventCounts {
  speeding: number;
  harshBrakes: number;
  harshAccels: number;
  harshOther: number;
}

const WEIGHTS = { speeding: 4, harshBrakes: 2.5, harshAccels: 2, harshOther: 1.5 };
const MIN_KM = 25;
const PENALTY_PER_100KM = 2;

export function safetyScore(counts: SafetyEventCounts, distanceKm: number): number {
  const weighted =
    counts.speeding * WEIGHTS.speeding +
    counts.harshBrakes * WEIGHTS.harshBrakes +
    counts.harshAccels * WEIGHTS.harshAccels +
    counts.harshOther * WEIGHTS.harshOther;
  const per100Km = (weighted * 100) / Math.max(distanceKm, MIN_KM);
  return Math.max(0, Math.min(100, Math.round(100 - per100Km * PENALTY_PER_100KM)));
}

export function scoreColor(score: number): string {
  if (score >= 90) return 'var(--pos, #2bbd7e)';
  if (score >= 70) return 'var(--warn, #f5b54a)';
  return 'var(--neg, #f06464)';
}

export function scoreLabel(score: number): string {
  if (score >= 90) return 'Good';
  if (score >= 70) return 'Fair';
  return 'Needs attention';
}
