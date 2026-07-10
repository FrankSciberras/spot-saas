import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireRole } from '@/lib/auth/session';
import { requireModule } from '@/lib/modules/guard';
import { createClient } from '@/lib/supabase/server';
import FleetShell from '@/components/fleet/FleetShell';
import styles from '../../settlements.module.css';

interface PageProps {
  params: Promise<{ id: string }>;
}

/**
 * Edit Settlement Page
 */
export default async function EditSettlementPage({ params }: PageProps) {
  const { id } = await params;
  const user = await requireRole(['admin']);
  await requireModule(user.organization_id, 'settlements');
  const supabase = await createClient();

  // Fetch the settlement
  const { data: settlement, error } = await supabase
    .from('driver_settlements')
    .select(`
      *,
      drivers:driver_id (id, full_name),
      settlement_platforms (*)
    `)
    .eq('id', id)
    .eq('organization_id', user.organization_id)
    .single();

  if (error || !settlement) {
    notFound();
  }

  // Fetch active drivers
  const { data: drivers } = await supabase
    .from('drivers')
    .select('id, full_name')
    .eq('organization_id', user.organization_id)
    .eq('status', 'active')
    .order('full_name');

  const driverName = (settlement.drivers as { full_name: string } | null)?.full_name || 'Unknown';

  return (
    <FleetShell user={user} title="Edit Settlement">
      <div className={styles.pageHeader}>
        <div className={styles.pageTitleMain}>
          <h2>Edit Settlement</h2>
          <p className={styles.pageSubtitle}>
            {driverName} • {settlement.week_label}
          </p>
        </div>
        <div className={styles.pageActions}>
          <Link href="/fleet/settlements" className="btn btn-secondary">
            ← Back to Settlements
          </Link>
        </div>
      </div>

      {/* <SettlementForm 
        drivers={drivers || []} 
        settlement={settlement}
        mode="edit" 
      /> */}
    </FleetShell>
  );
}
