import { requireRole } from '@/lib/auth/session';
import { createAdminClient } from '@/lib/supabase/server';
import FleetShell from '@/components/fleet/FleetShell';
import RemindersManager from '@/components/admin/RemindersManager';
import { getResourcePermissionsForUser } from '@/lib/permissions';
import { redirect } from 'next/navigation';

export default async function RemindersPage() {
  const user = await requireRole(['admin', 'staff']);
  const permissions = await getResourcePermissionsForUser(user, 'reminders');

  if (!permissions.can_view) {
    redirect('/fleet');
  }

  const supabase = createAdminClient();
  const isAdmin = user.role === 'admin';

  let remindersQuery = supabase
    .from('reminders')
    .select(`
      *,
      creator:created_by (full_name, email),
      assignee:assigned_to (full_name, email)
    `)
    .order('due_date', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false });

  if (!isAdmin) {
    remindersQuery = remindersQuery.or(`created_by.eq.${user.id},assigned_to.eq.${user.id}`);
  }

  const { data: reminders } = await remindersQuery;

  const shouldLoadAssignableUsers = permissions.can_create || permissions.can_edit;
  const { data: users } = shouldLoadAssignableUsers
    ? await supabase
        .from('users')
        .select('id, full_name, email, role, also_staff')
        .or('role.eq.admin,role.eq.staff,also_staff.eq.true')
        .order('full_name')
    : { data: [] };

  return (
    <FleetShell user={user} title="Reminders">
      <RemindersManager
        initialReminders={reminders || []}
        users={users || []}
        isAdmin={isAdmin}
        permissions={permissions}
      />
    </FleetShell>
  );
}
