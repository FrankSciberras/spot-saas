import { requireRole } from '@/lib/auth/session';
import DashboardLayout from '@/components/shared/DashboardLayout';
import StatisticsDashboard from '@/components/admin/StatisticsDashboard';

export default async function StatisticsPage() {
  const user = await requireRole(['admin', 'staff']);

  return (
    <DashboardLayout user={user} variant="admin" title="Statistics">
      <StatisticsDashboard />
    </DashboardLayout>
  );
}
