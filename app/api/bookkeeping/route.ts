import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSession } from '@/lib/auth/session';
import { syncPeriodEntries, validatePeriodDates, isPeriodType } from '@/lib/bookkeeping/entries';
import type { BookkeepingPeriodInput } from '@/lib/types/database';

/**
 * GET /api/bookkeeping - Fetch all bookkeeping periods with their entries
 */
export async function GET() {
  try {
    const supabase = await createClient();

    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (session.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { data: periods, error } = await supabase
      .from('bookkeeping_periods')
      .select('*, entries:bookkeeping_entries(*)')
      .eq('organization_id', session.organization_id)
      .order('start_date', { ascending: false });

    if (error) {
      console.error('Error fetching bookkeeping periods:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data: periods });
  } catch (error) {
    console.error('Error in GET /api/bookkeeping:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/bookkeeping - Create a bookkeeping period and its entries
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient();

    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (session.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body: BookkeepingPeriodInput = await request.json();

    const dateError = validatePeriodDates(body.start_date, body.end_date);
    if (dateError) {
      return NextResponse.json({ error: dateError }, { status: 400 });
    }
    if (!body.label || typeof body.label !== 'string') {
      return NextResponse.json({ error: 'label is required' }, { status: 400 });
    }
    if (body.period_type && !isPeriodType(body.period_type)) {
      return NextResponse.json({ error: 'period_type must be week, month or custom' }, { status: 400 });
    }

    const startDate = body.start_date.split('T')[0];
    const endDate = body.end_date.split('T')[0];

    // One period per exact date range, per fleet.
    const { data: existing } = await supabase
      .from('bookkeeping_periods')
      .select('id')
      .eq('organization_id', session.organization_id)
      .eq('start_date', startDate)
      .eq('end_date', endDate)
      .maybeSingle();

    if (existing) {
      return NextResponse.json(
        { error: 'A period already exists for this date range' },
        { status: 409 }
      );
    }

    const { data: period, error } = await supabase
      .from('bookkeeping_periods')
      .insert({
        organization_id: session.organization_id,
        period_type: body.period_type || 'week',
        start_date: startDate,
        end_date: endDate,
        label: body.label,
        name: body.name || null,
        notes: body.notes || null,
        status: body.status === 'finalized' ? 'finalized' : 'draft',
        created_by: session.id,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating bookkeeping period:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const sync = await syncPeriodEntries(
      supabase,
      session.organization_id,
      period.id,
      body.amounts || {},
    );

    if (sync.error) {
      // Don't leave a half-saved period behind.
      await supabase.from('bookkeeping_periods').delete().eq('id', period.id);
      return NextResponse.json({ error: sync.error }, { status: sync.status ?? 500 });
    }

    // Re-read so the caller gets the trigger-computed totals.
    const { data: saved } = await supabase
      .from('bookkeeping_periods')
      .select('*, entries:bookkeeping_entries(*)')
      .eq('id', period.id)
      .single();

    return NextResponse.json({ data: saved ?? period }, { status: 201 });
  } catch (error) {
    console.error('Error in POST /api/bookkeeping:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
