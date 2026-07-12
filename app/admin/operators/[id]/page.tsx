import { notFound } from 'next/navigation';
import { requirePlatformAdmin } from '@/lib/auth/platform';
import { getAllPlans } from '@/lib/billing/plans-data';
import { getOperatorProfile } from '@/lib/admin/operator-profile';
import OperatorProfileView from './OperatorProfileView';
import type { PlanMeta } from '../../console/types';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string }>;
}

/** Soft background token for a plan pill, derived from its accent (mirrors the console). */
function softBg(color: string | null): string {
  if (!color) return 'var(--bg-3)';
  if (color.startsWith('#')) return color + '22';
  if (color.includes('accent')) return 'var(--accent-soft)';
  return 'var(--bg-3)';
}

/**
 * Full per-operator detail page — everything the platform admin needs to see what
 * a fleet is doing and has: subscription & billing state, enabled modules, and
 * their vehicles, drivers and members. Reached by clicking an operator in the
 * console. Gated to platform admins by the /admin layout + here.
 */
export default async function OperatorDetailPage({ params }: PageProps) {
  const { id } = await params;
  await requirePlatformAdmin();

  const [profile, planRows] = await Promise.all([getOperatorProfile(id), getAllPlans()]);
  if (!profile) notFound();

  // Plan label/colour lookup + the keys an admin may assign (for the quick plan switcher).
  const planMeta: Record<string, PlanMeta> = {
    trial: { label: 'Trial', color: 'var(--text-3)', bg: 'var(--bg-3)' },
  };
  for (const p of planRows) {
    planMeta[p.key] = { label: p.name, color: p.color || 'var(--text-2)', bg: softBg(p.color) };
  }
  const assignablePlans = ['trial', ...planRows.map((p) => p.key)];

  return (
    <div className="fleetTheme fleetCanvas" data-fleet-theme="dark">
      <OperatorProfileView profile={profile} planMeta={planMeta} assignablePlans={assignablePlans} />
    </div>
  );
}
