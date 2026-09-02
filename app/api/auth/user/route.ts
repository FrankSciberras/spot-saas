import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';

/**
 * GET /api/auth/user — who am I, in my ACTIVE fleet.
 *
 * Client components (fleet settings/permissions pages, the driver portal's
 * go-online and share-location screens, the native-app bridge) call this to
 * learn the caller's role, fleet and driver id. Everything comes from
 * getSession(), i.e. the membership in the active organization — NOT the
 * deprecated global users.role column this route used to return, which made
 * admin-gated UI show for the wrong people and left the fleet switcher empty.
 *
 * `driver_id` is the caller's driver row in the active fleet (null for
 * non-drivers). A driver who works for two fleets has two rows, so clients
 * must use this id instead of looking drivers up by user_id.
 */
export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    return NextResponse.json(
      {
        id: session.id,
        email: session.email,
        full_name: session.full_name,
        role: session.role,
        also_staff: session.also_staff,
        organization_id: session.organization_id,
        organization_name: session.organization_name,
        driver_id: session.driver_id ?? null,
        memberships: session.memberships,
        fleet_tour_completed: session.fleet_tour_completed,
      },
      { headers: { 'Cache-Control': 'private, no-store' } }
    );
  } catch (error) {
    console.error('Error fetching user:', error);
    return NextResponse.json({ error: 'Failed to fetch user' }, { status: 500 });
  }
}
