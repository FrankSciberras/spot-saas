import { requireRole } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import DashboardLayout from '@/components/shared/DashboardLayout';
import RemindersManager from '@/components/admin/RemindersManager';

export default async function RemindersPage() {
  const user = await requireRole(['admin', 'staff']);
  const supabase = await createClient();
  const isAdmin = user.role === 'admin';

  const { data: reminders } = await supabase
    .from('reminders')
    .select(`
      *,
      creator:created_by (full_name, email),
      assignee:assigned_to (full_name, email)
    `)
    .order('due_date', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false });

  // Get users for assignment dropdown (admin + staff, including dual-role driver staff)
  const { data: users } = await supabase
    .from('users')
    .select('id, full_name, email, role, also_staff')
    .or('role.eq.admin,role.eq.staff,also_staff.eq.true')
    .order('full_name');

  return (
    <DashboardLayout user={user} variant="admin" title="Reminders">
      <RemindersManager
        initialReminders={reminders || []}
        users={users || []}
        currentUserId={user.id}
        isAdmin={isAdmin}
      />
    </DashboardLayout>
  );
}
