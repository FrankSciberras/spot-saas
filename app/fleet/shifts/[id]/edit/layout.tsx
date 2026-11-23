import { requireRole } from '@/lib/auth/session';
import FleetShell from '@/components/fleet/FleetShell';

/**
 * The edit form itself is a client page that loads its own data, so it used to
 * render bare — no top bar, sidebar or bottom navigation. This gives it the
 * same shell (and the same role gate) as the shift detail page it opens from.
 */
export default async function EditShiftLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole(['admin', 'staff']);
  return (
    <FleetShell user={user} title="Edit Shift">
      {children}
    </FleetShell>
  );
}
