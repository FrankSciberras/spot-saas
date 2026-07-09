import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';

/**
 * POST /api/settlements/update-month
 * Update the settlement_month for all settlements in a given week
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireRole(['admin']);
    const supabase = await createClient();
    const body = await request.json();

    const { weekStart, settlementMonth } = body;

    if (!weekStart) {
      return NextResponse.json(
        { error: 'weekStart is required' },
        { status: 400 }
      );
    }

    if (settlementMonth && !/^\d{4}-\d{2}-\d{2}$/.test(settlementMonth)) {
      return NextResponse.json(
        { error: 'settlementMonth must be a YYYY-MM-DD date' },
        { status: 400 }
      );
    }

    // Update all settlements for this week — scoped to the caller's active fleet
    // (defense-in-depth alongside RLS) so a multi-fleet admin can't touch others.
    const { error, count } = await supabase
      .from('driver_settlements')
      .update({ settlement_month: settlementMonth || null })
      .eq('week_start', weekStart)
      .eq('organization_id', user.organization_id);

    if (error) {
      console.error('Supabase error:', error);
      return NextResponse.json(
        { error: error.message || 'Database update failed' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, updated: count });
  } catch (error) {
    console.error('Failed to update settlement month:', error);
    const message = error instanceof Error ? error.message : 'Failed to update settlement month';
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
