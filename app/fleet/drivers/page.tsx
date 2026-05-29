import { requireRole } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import FleetShell from '@/components/fleet/FleetShell';
import DriversWorkspace, { type DriverItem, type DocState } from '@/components/fleet/drivers/DriversWorkspace';

const PALETTE = ['#5b8dff', '#3ecf8e', '#a78bfa', '#f5b54a', '#f472b6', '#f06464', '#38bdf8', '#facc15'];

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function docState(date: string | null, now: Date, soon: Date): DocState {
  if (!date) return 'missing';
  const d = new Date(date);
  if (d < now) return 'expired';
  if (d <= soon) return 'warn';
  return 'ok';
}

function relativeTime(date: Date | null, now: Date): string {
  if (!date) return '—';
  const diffMs = now.getTime() - date.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 60) return mins <= 1 ? 'Just now' : `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs > 1 ? 's' : ''} ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return 'Yesterday';
  return `${days} days ago`;
}

export default async function DriversPage() {
  const user = await requireRole(['admin', 'staff']);
  const supabase = await createClient();
  const isAdmin = user.role === 'admin';

  const now = new Date();
  const soon = new Date();
  soon.setDate(soon.getDate() + 30);
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - 7);

  const [driversResult, assignmentsResult, shiftsResult, earningsResult] = await Promise.all([
    supabase
      .from('drivers')
      .select('id, full_name, phone, status, assigned_vehicle_id, id_card_expiry_date, police_conduct_expiry_date, driving_license_expiry_date, vehicles:assigned_vehicle_id (registration_number)')
      .order('full_name'),
    supabase
      .from('driver_vehicle_assignments')
      .select('driver_id, vehicles:vehicle_id (registration_number)'),
    supabase
      .from('driver_shifts')
      .select('driver_id, start_time, end_time')
      .gte('start_time', weekStart.toISOString())
      .order('start_time', { ascending: false }),
    supabase
      .from('earnings')
      .select('driver_id, amount, period_start')
      .gte('period_start', weekStart.toISOString().split('T')[0]),
  ]);

  const driverRows = (driversResult.data || []) as any[];
  const assignmentRows = (assignmentsResult.data || []) as any[];
  const shiftRows = (shiftsResult.data || []) as any[];
  const earningRows = (earningsResult.data || []) as any[];

  // Plates per driver from assignments (+ assigned_vehicle_id fallback)
  const platesByDriver = new Map<string, Set<string>>();
  for (const row of assignmentRows) {
    if (!row.driver_id) continue;
    const v = Array.isArray(row.vehicles) ? row.vehicles[0] : row.vehicles;
    if (!v?.registration_number) continue;
    if (!platesByDriver.has(row.driver_id)) platesByDriver.set(row.driver_id, new Set());
    platesByDriver.get(row.driver_id)!.add(v.registration_number);
  }

  // Shift aggregation: on-shift (open shift), clock-in, last shift, hours this week
  const onShift = new Map<string, Date>();
  const lastShiftEnd = new Map<string, Date>();
  const weekHours = new Map<string, number>();
  for (const s of shiftRows) {
    if (!s.driver_id || !s.start_time) continue;
    const start = new Date(s.start_time);
    const end = s.end_time ? new Date(s.end_time) : null;
    if (!end) {
      if (!onShift.has(s.driver_id)) onShift.set(s.driver_id, start);
    } else {
      if (!lastShiftEnd.has(s.driver_id) || end > lastShiftEnd.get(s.driver_id)!) {
        lastShiftEnd.set(s.driver_id, end);
      }
      const hrs = (end.getTime() - start.getTime()) / 3600000;
      weekHours.set(s.driver_id, (weekHours.get(s.driver_id) || 0) + Math.max(0, hrs));
    }
  }

  const weekEarnings = new Map<string, number>();
  for (const e of earningRows) {
    if (!e.driver_id) continue;
    weekEarnings.set(e.driver_id, (weekEarnings.get(e.driver_id) || 0) + (e.amount || 0));
  }

  const drivers: DriverItem[] = driverRows.map((d, i) => {
    const plates = platesByDriver.get(d.id) || new Set<string>();
    const assigned = Array.isArray(d.vehicles) ? d.vehicles[0] : d.vehicles;
    if (assigned?.registration_number) plates.add(assigned.registration_number);
    const openStart = onShift.get(d.id);
    return {
      id: d.id,
      name: d.full_name || 'Unknown',
      initials: initialsOf(d.full_name || '?'),
      color: PALETTE[i % PALETTE.length],
      status: openStart ? 'on' : 'off',
      clockIn: openStart ? openStart.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '—',
      lastShift: relativeTime(lastShiftEnd.get(d.id) || null, now),
      phone: d.phone || '—',
      vehicles: Array.from(plates),
      weekEarnings: weekEarnings.get(d.id) || 0,
      weekHours: weekHours.get(d.id) || 0,
      docs: {
        id: docState(d.id_card_expiry_date, now, soon),
        police: docState(d.police_conduct_expiry_date, now, soon),
        license: docState(d.driving_license_expiry_date, now, soon),
      },
    };
  });

  return (
    <FleetShell user={user} title="Drivers">
      <DriversWorkspace drivers={drivers} canAdd={isAdmin} />
    </FleetShell>
  );
}
