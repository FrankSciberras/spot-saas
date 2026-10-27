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
  /** Sharp cornering — detected by driver app ≥ 1.0.4. */
  harshTurns?: number;
  harshOther: number;
}

const WEIGHTS = { speeding: 4, harshBrakes: 2.5, harshAccels: 2, harshTurns: 2, harshOther: 1.5 };
const MIN_KM = 25;
const PENALTY_PER_100KM = 2;

export function safetyScore(counts: SafetyEventCounts, distanceKm: number): number {
  const weighted =
    counts.speeding * WEIGHTS.speeding +
    counts.harshBrakes * WEIGHTS.harshBrakes +
    counts.harshAccels * WEIGHTS.harshAccels +
    (counts.harshTurns || 0) * WEIGHTS.harshTurns +
    counts.harshOther * WEIGHTS.harshOther;
  const per100Km = (weighted * 100) / Math.max(distanceKm, MIN_KM);
  return Math.max(0, Math.min(100, Math.round(100 - per100Km * PENALTY_PER_100KM)));
}

/** Tally behaviour-event kinds into the score's counters. */
export function countBehaviorKinds(kinds: string[]): { harshBrakes: number; harshAccels: number; harshTurns: number; harshOther: number } {
  const c = { harshBrakes: 0, harshAccels: 0, harshTurns: 0, harshOther: 0 };
  for (const k of kinds) {
    if (k === 'harsh_brake') c.harshBrakes++;
    else if (k === 'harsh_accel') c.harshAccels++;
    else if (k === 'harsh_turn') c.harshTurns++;
    else c.harshOther++;
  }
  return c;
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

// -----------------------------------------------------------------------------
// Event presentation — shared by the safety pages.
// -----------------------------------------------------------------------------

export type SafetyEventKind = 'harsh_brake' | 'harsh_accel' | 'harsh_turn' | 'harsh_motion' | 'speeding';

export const EVENT_KIND_META: Record<SafetyEventKind, { label: string; short: string; color: string }> = {
  harsh_brake: { label: 'Sharp braking', short: 'Braking', color: '#f06464' },
  harsh_accel: { label: 'Rapid acceleration', short: 'Acceleration', color: '#f5b54a' },
  harsh_turn: { label: 'Sharp cornering', short: 'Cornering', color: '#a78bfa' },
  harsh_motion: { label: 'Harsh movement (type unclear)', short: 'Unclear', color: '#94a3b8' },
  speeding: { label: 'Speeding', short: 'Speeding', color: '#38bdf8' },
};

export function eventKindMeta(kind: string) {
  return EVENT_KIND_META[(kind in EVENT_KIND_META ? kind : 'harsh_motion') as SafetyEventKind];
}

/** Peak horizontal force (m/s²) → plain-English strength. */
export function severityOf(magnitude: number | null): { label: string; g: string | null; level: 0 | 1 | 2 } {
  if (magnitude == null) return { label: 'Unknown strength', g: null, level: 0 };
  const g = `${(magnitude / 9.81).toFixed(2)} g`;
  if (magnitude >= 5.5) return { label: 'Severe', g, level: 2 };
  if (magnitude >= 4.2) return { label: 'Strong', g, level: 1 };
  return { label: 'Moderate', g, level: 0 };
}

/** How the driver app decided the event type, in plain English. */
export function classifiedByLabel(by: string | null): string | null {
  if (by === 'sensor') return 'Direction of the force, measured by the phone';
  if (by === 'gps') return 'Change in GPS speed around the event';
  if (by === 'turn') return 'The car was turning fast (gyroscope)';
  return null;
}
