import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { CreateAdjustmentInput } from '@/lib/types/database';

/**
 * GET /api/adjustments - List driver adjustments
 * Query params: driver_id, type, from_date, to_date
 */
export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const { searchParams } = new URL(request.url);
    
    // Check auth
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check role
    const { data: profile } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!profile) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
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
    } else if (profile.role === 'driver') {
      // Drivers can only see their own adjustments
      const { data: driverRecord } = await supabase
        .from('drivers')
        .select('id')
        .eq('user_id', user.id)
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

    const { data: adjustments, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
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
    
    // Check auth
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check role - only admin can create adjustments
    const { data: profile } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!profile || profile.role !== 'admin') {
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
        driver_id: body.driver_id,
        type: body.type,
        amount: body.amount,
        description: body.description,
        date: body.date,
        notes: body.notes || null,
        created_by: user.id,
      })
      .select(`
        *,
        drivers:driver_id (id, full_name)
      `)
      .single();

    if (adjustmentError) {
      console.error('Adjustment creation error:', adjustmentError);
      return NextResponse.json({ error: adjustmentError.message }, { status: 500 });
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
