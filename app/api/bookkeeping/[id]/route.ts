import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSession } from '@/lib/auth/session';
import { syncPeriodEntries, validatePeriodDates, isPeriodType } from '@/lib/bookkeeping/entries';
import type { BookkeepingPeriodInput } from '@/lib/types/database';

const PERIOD_SELECT = '*, entries:bookkeeping_entries(*)';

/**
 * GET /api/bookkeeping/[id] - Get a single period with its entries
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();

    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (session.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { data: period, error } = await supabase
      .from('bookkeeping_periods')
      .select(PERIOD_SELECT)
      .eq('id', id)
      .eq('organization_id', session.organization_id)
      .maybeSingle();

    if (error) {
      console.error('Error fetching period:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!period) {
      return NextResponse.json({ error: 'Period not found' }, { status: 404 });
    }

    return NextResponse.json({ data: period });
  } catch (error) {
    console.error('Error in GET /api/bookkeeping/[id]:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * PUT /api/bookkeeping/[id] - Update a period and replace its entries
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();

    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (session.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body: Partial<BookkeepingPeriodInput> = await request.json();

    const { data: existing, error: fetchError } = await supabase
      .from('bookkeeping_periods')
      .select('*')
      .eq('id', id)
      .eq('organization_id', session.organization_id)
      .maybeSingle();

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }
    if (!existing) {
      return NextResponse.json({ error: 'Period not found' }, { status: 404 });
    }

    const startDate = (body.start_date ?? existing.start_date).split('T')[0];
    const endDate = (body.end_date ?? existing.end_date).split('T')[0];

    const dateError = validatePeriodDates(startDate, endDate);
    if (dateError) {
      return NextResponse.json({ error: dateError }, { status: 400 });
    }
    if (body.period_type && !isPeriodType(body.period_type)) {
      return NextResponse.json({ error: 'period_type must be week, month or custom' }, { status: 400 });
    }

    // Moving a period onto another one's dates used to surface as a raw 500
    // from the unique constraint; catch it here and say what actually happened.
    if (startDate !== existing.start_date || endDate !== existing.end_date) {
      const { data: clash } = await supabase
        .from('bookkeeping_periods')
        .select('id')
        .eq('organization_id', session.organization_id)
        .eq('start_date', startDate)
        .eq('end_date', endDate)
        .neq('id', id)
        .maybeSingle();

      if (clash) {
        return NextResponse.json(
          { error: 'Another period already covers this date range' },
          { status: 409 }
        );
      }
    }

    const { error: updateError } = await supabase
      .from('bookkeeping_periods')
      .update({
        period_type: body.period_type ?? existing.period_type,
        start_date: startDate,
        end_date: endDate,
        label: body.label ?? existing.label,
        name: body.name !== undefined ? body.name : existing.name,
        notes: body.notes !== undefined ? body.notes : existing.notes,
        status: body.status ?? existing.status,
      })
      .eq('id', id)
      // active-fleet scope (RLS alone merges a multi-fleet user's orgs)
      .eq('organization_id', session.organization_id);

    if (updateError) {
      console.error('Error updating period:', updateError);
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    if (body.amounts) {
      const sync = await syncPeriodEntries(
        supabase,
        session.organization_id,
        id,
        body.amounts,
      );
      if (sync.error) {
        return NextResponse.json({ error: sync.error }, { status: sync.status ?? 500 });
      }
    }

    const { data: saved } = await supabase
      .from('bookkeeping_periods')
      .select(PERIOD_SELECT)
      .eq('id', id)
      // active-fleet scope (RLS alone merges a multi-fleet user's orgs)
      .eq('organization_id', session.organization_id)
      .single();

    return NextResponse.json({ data: saved });
  } catch (error) {
    console.error('Error in PUT /api/bookkeeping/[id]:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/bookkeeping/[id] - Delete a period (entries cascade)
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();

    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (session.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { error } = await supabase
      .from('bookkeeping_periods')
      .delete()
      .eq('id', id)
      .eq('organization_id', session.organization_id);

    if (error) {
      console.error('Error deleting period:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in DELETE /api/bookkeeping/[id]:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
