import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSession } from '@/lib/auth/session';

function formatWeekLabel(weekStart: string, weekEnd: string): string {
  const start = new Date(`${weekStart}T00:00:00`);
  const end = new Date(`${weekEnd}T00:00:00`);

  const formatOptions: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short' };
  const startStr = start.toLocaleDateString('en-GB', formatOptions);
  const endStr = end.toLocaleDateString('en-GB', { ...formatOptions, year: 'numeric' });

  return `${startStr} - ${endStr}`;
}

interface PeriodUpdateBody {
  current_week_start?: string;
  week_start?: string;
  week_end?: string;
  period_name?: string | null;
  settlement_month?: string | null;
}

/**
 * PUT /api/settlements/period
 * Update the shared period metadata for all settlements in a week.
 * Requires admin role.
 */
export async function PUT(request: Request) {
  try {
    const supabase = await createClient();

    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (session.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json() as PeriodUpdateBody;
    const currentWeekStart = body.current_week_start;
    const nextWeekStart = body.week_start;
    const nextWeekEnd = body.week_end;

    if (!currentWeekStart || !nextWeekStart || !nextWeekEnd) {
      return NextResponse.json(
        { error: 'current_week_start, week_start, and week_end are required' },
        { status: 400 }
      );
    }

    if (nextWeekEnd < nextWeekStart) {
      return NextResponse.json(
        { error: 'Week end date cannot be before the start date' },
        { status: 400 }
      );
    }

    const { data: currentPeriodSettlements, error: currentPeriodError } = await supabase
      .from('driver_settlements')
      .select('id, driver_id')
      .eq('week_start', currentWeekStart);

    if (currentPeriodError) {
      return NextResponse.json({ error: currentPeriodError.message }, { status: 500 });
    }

    if (!currentPeriodSettlements || currentPeriodSettlements.length === 0) {
      return NextResponse.json({ error: 'No settlements found for that week' }, { status: 404 });
    }

    if (nextWeekStart !== currentWeekStart) {
      const currentSettlementIds = currentPeriodSettlements.map((settlement) => settlement.id);
      const driverIds = currentPeriodSettlements.map((settlement) => settlement.driver_id);
      const excludedIds = `(${currentSettlementIds.map((settlementId) => `"${settlementId}"`).join(',')})`;

      const { data: conflicts, error: conflictError } = await supabase
        .from('driver_settlements')
        .select('id, driver_id')
        .eq('week_start', nextWeekStart)
        .in('driver_id', driverIds)
        .not('id', 'in', excludedIds);

      if (conflictError) {
        return NextResponse.json({ error: conflictError.message }, { status: 500 });
      }

      if (conflicts && conflicts.length > 0) {
        return NextResponse.json(
          { error: 'One or more drivers already have settlements in the target week start date' },
          { status: 409 }
        );
      }
    }

    const updateData = {
      week_start: nextWeekStart,
      week_end: nextWeekEnd,
      week_label: formatWeekLabel(nextWeekStart, nextWeekEnd),
      period_name: body.period_name ?? null,
      settlement_month: body.settlement_month ?? null,
      updated_at: new Date().toISOString(),
    };

    const { error: updateError, count } = await supabase
      .from('driver_settlements')
      .update(updateData, { count: 'exact' })
      .eq('week_start', currentWeekStart);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      updated: count || 0,
      week_start: nextWeekStart,
      week_end: nextWeekEnd,
      week_label: updateData.week_label,
      period_name: updateData.period_name,
      settlement_month: updateData.settlement_month,
    });
  } catch (error) {
    console.error('Error updating settlement period:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
