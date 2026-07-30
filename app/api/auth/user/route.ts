import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// GET - Get current authenticated user
export async function GET() {
  try {
    const supabase = await createClient();
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Fetch user details from users table
    const { data: userData, error } = await supabase
      .from('users')
      .select('id, email, role, full_name, also_staff, fleet_tour_completed_at')
      .eq('id', user.id)
      .single();

    if (error || !userData) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Client pages feed this straight into FleetShell, which passes the flag to
    // the welcome tour. Without it the tour only had localStorage to go on, so
    // it re-ran for an already-onboarded operator on every new browser.
    const { fleet_tour_completed_at, ...rest } = userData as typeof userData & {
      fleet_tour_completed_at?: string | null;
    };

    return NextResponse.json({ ...rest, fleet_tour_completed: !!fleet_tour_completed_at });
  } catch (error) {
    console.error('Error fetching user:', error);
    return NextResponse.json({ error: 'Failed to fetch user' }, { status: 500 });
  }
}
