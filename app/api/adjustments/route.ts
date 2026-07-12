import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSession } from '@/lib/auth/session';
import type { CreateAdjustmentInput } from '@/lib/types/database';

function normalizeAdjustmentsError(message: string): string {
  if (
    message.includes("Could not find the table 'public.driver_adjustments'") ||
    (message.includes('Could not find the table') && message.includes('driver_adjustments'))
  ) {
    return "The 'driver_adjustments' table is missing in your Supabase database/schema cache. Apply the migration 'supabase/migrations/20260120_driver_adjustments.sql' to the Supabase project you're connected to, then reload the schema cache and refresh.";
  }
  return message;
}

/**
 * GET /api/adjustments - List driver adjustments
 * Query params: driver_id, type, from_date, to_date
 */
export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const { searchParams } = new URL(request.url);

    // Check auth
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Build query
    let query = supabase
      .from('driver_adjustments')
      .select(`
        *,
        drivers:driver_id (id, full_name)
      `)
      .order('date', { ascending: false });

    // Filter by driver if specified or if user is a driver
    const driverId = searchParams.get('driver_id');
    if (driverId) {
      query = query.eq('driver_id', driverId);
    } else if (session.role === 'driver') {
      // Drivers can only see their own adjustments
      const { data: driverRecord } = await supabase
        .from('drivers')
        .select('id')
        .eq('user_id', session.id)
        .single();
      
      if (driverRecord) {
        query = query.eq('driver_id', driverRecord.id);
      } else {
        return NextResponse.json({ data: [] });
      }
    }

    // Filter by type
    const type = searchParams.get('type');
    if (type) {
      query = query.eq('type', type);
    }

    // Filter by date range
    const fromDate = searchParams.get('from_date');
    const toDate = searchParams.get('to_date');
    if (fromDate) {
      query = query.gte('date', fromDate);
    }
    if (toDate) {
      query = query.lte('date', toDate);
    }

    // Settlement linkage filters (frozen adjustments).
    //   settlement_id=<id>      → adjustments frozen onto one settlement
    //   settlement_ids=a,b,c    → frozen onto any of these settlements
    //   unassigned=true         → not yet attached to any settlement
    const settlementId = searchParams.get('settlement_id');
    const settlementIds = searchParams.get('settlement_ids');
    const unassigned = searchParams.get('unassigned');
    if (settlementId) {
      query = query.eq('settlement_id', settlementId);
    } else if (settlementIds) {
      const ids = settlementIds.split(',').map((s) => s.trim()).filter(Boolean);
      query = ids.length > 0 ? query.in('settlement_id', ids) : query.eq('settlement_id', '__none__');
    } else if (unassigned === 'true') {
      query = query.is('settlement_id', null);
    }

    const { data: adjustments, error } = await query;

    if (error) {
      return NextResponse.json({ error: normalizeAdjustmentsError(error.message) }, { status: 500 });
    }

    return NextResponse.json({ data: adjustments });
  } catch (error) {
    console.error('Error fetching adjustments:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/adjustments - Create a new adjustment
 * Requires admin role
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient();

    // Check auth - only admin can create adjustments
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (session.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Parse request body
    const body: CreateAdjustmentInput = await request.json();

    // Validate required fields
    if (!body.driver_id || !body.type || body.amount === undefined || !body.description || !body.date) {
      return NextResponse.json(
        { error: 'driver_id, type, amount, description, and date are required' },
        { status: 400 }
      );
    }

    // Validate type
    const validTypes = ['expense', 'bonus', 'deduction', 'reimbursement', 'other'];
    if (!validTypes.includes(body.type)) {
      return NextResponse.json(
        { error: `Invalid type. Must be one of: ${validTypes.join(', ')}` },
        { status: 400 }
      );
    }

    // Create adjustment
    const { data: adjustment, error: adjustmentError } = await supabase
      .from('driver_adjustments')
      .insert({
        organization_id: session.organization_id,
        driver_id: body.driver_id,
        type: body.type,
        amount: body.amount,
        description: body.description,
        date: body.date,
        notes: body.notes || null,
        created_by: session.id,
      })
      .select(`
        *,
        drivers:driver_id (id, full_name)
      `)
      .single();

    if (adjustmentError) {
      console.error('Adjustment creation error:', adjustmentError);
      return NextResponse.json({ error: normalizeAdjustmentsError(adjustmentError.message) }, { status: 500 });
    }

    return NextResponse.json({ data: adjustment }, { status: 201 });
  } catch (error) {
    console.error('Error creating adjustment:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
