import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { CreateSettlementInput } from '@/lib/types/database';
import { calculateSettlement, type PlatformEarningsInput } from '@/lib/utils/settlementCalculations';
import { resolveScheme } from '@/lib/config/settlements';

const SCHEME_COLUMNS =
  'settlement_driver_share_pct, settlement_tips_driver_pct, settlement_campaigns_driver_pct, settlement_fee_driver_pct';

/**
 * GET /api/settlements - List settlements
 * Query params: driver_id, week_start, status
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
      .from('driver_settlements')
      .select(`
        *,
        drivers:driver_id (id, full_name),
        settlement_platforms (*)
      `)
      .order('week_start', { ascending: false });

    // Filter by driver if specified or if user is a driver
    const driverId = searchParams.get('driver_id');
    if (driverId) {
      query = query.eq('driver_id', driverId);
    } else if (profile.role === 'driver') {
      // Drivers can only see their own settlements
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

    // Filter by week
    const weekStart = searchParams.get('week_start');
    if (weekStart) {
      query = query.eq('week_start', weekStart);
    }

    // Filter by status
    const status = searchParams.get('status');
    if (status) {
      query = query.eq('status', status);
    }

    const { data: settlements, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data: settlements });
  } catch (error) {
    console.error('Error fetching settlements:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/settlements - Create a new settlement
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

    // Check role - only admin can create settlements
    const { data: profile } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!profile || profile.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Parse request body
    const body: CreateSettlementInput = await request.json();

    // Validate required fields
    if (!body.driver_id || !body.week_start || !body.week_end) {
      return NextResponse.json(
        { error: 'driver_id, week_start, and week_end are required' },
        { status: 400 }
      );
    }

    // Check for existing settlement for this driver and week
    const { data: existing } = await supabase
      .from('driver_settlements')
      .select('id')
      .eq('driver_id', body.driver_id)
      .eq('week_start', body.week_start)
      .single();

    if (existing) {
      return NextResponse.json(
        { error: 'Settlement already exists for this driver and week' },
        { status: 409 }
      );
    }

    // Resolve the effective settlement scheme for this driver:
    // per-driver override (if set) -> fleet default -> code default.
    const { data: driverRow } = await supabase
      .from('drivers')
      .select(`organization_id, ${SCHEME_COLUMNS}`)
      .eq('id', body.driver_id)
      .single();

    let orgDefaults = null;
    if (driverRow?.organization_id) {
      const { data: org } = await supabase
        .from('organizations')
        .select(SCHEME_COLUMNS)
        .eq('id', driverRow.organization_id)
        .single();
      orgDefaults = org;
    }

    const scheme = resolveScheme(orgDefaults, driverRow);

    // Calculate totals from platform data
    const platformInputs: PlatformEarningsInput[] = (body.platforms || []).map(p => ({
      platformId: p.platform_id,
      grossFare: p.gross_fare,
      platformFeePercent: p.platform_fee_percent,
      cashRide: p.cash_ride,
      tips: p.tips,
      campaigns: p.campaigns || 0,
    }));

    const calculation = calculateSettlement(platformInputs, body.fss_tax, scheme);

    // Create settlement
    const { data: settlement, error: settlementError } = await supabase
      .from('driver_settlements')
      .insert({
        driver_id: body.driver_id,
        week_start: body.week_start,
        week_end: body.week_end,
        week_label: body.week_label,
        period_name: body.period_name || null,
        settlement_month: body.settlement_month || null,
        fss_tax: calculation.fssTax,
        driver_share_pct: scheme.driverSharePct,
        tips_driver_pct: scheme.tipsDriverPct,
        campaigns_driver_pct: scheme.campaignsDriverPct,
        fee_driver_pct: scheme.feeDriverPct,
        total_gross_fare: calculation.totalGrossFare,
        total_net: calculation.totalNet,
        total_balance_before_tax: calculation.totalBalanceBeforeTax,
        final_balance: calculation.finalBalance,
        status: body.status || 'draft',
        notes: body.notes || null,
        created_by: user.id,
      })
      .select()
      .single();

    if (settlementError) {
      console.error('Settlement creation error:', settlementError);
      return NextResponse.json({ error: settlementError.message }, { status: 500 });
    }

    // Insert platform records
    if (body.platforms && body.platforms.length > 0) {
      const platformRecords = calculation.platforms.map((p, idx) => ({
        settlement_id: settlement.id,
        platform_id: p.platformId,
        platform_name: body.platforms[idx].platform_name,
        gross_fare: p.grossFare,
        platform_fee_percent: p.platformFeePercent,
        fifty_percent: p.fiftyPercent,
        fee: p.fee,
        net: p.net,
        cash_ride: p.cashRide,
        tips: p.tips,
        campaigns: p.campaigns,
        balance: p.balance,
      }));

      const { error: platformError } = await supabase
        .from('settlement_platforms')
        .insert(platformRecords);

      if (platformError) {
        // Rollback settlement on platform insert failure
        await supabase.from('driver_settlements').delete().eq('id', settlement.id);
        console.error('Platform insert error:', platformError);
        return NextResponse.json({ error: platformError.message }, { status: 500 });
      }
    }

    // Fetch complete settlement with platforms
    const { data: completeSettlement } = await supabase
      .from('driver_settlements')
      .select(`
        *,
        drivers:driver_id (id, full_name),
        settlement_platforms (*)
      `)
      .eq('id', settlement.id)
      .single();

    return NextResponse.json({ data: completeSettlement }, { status: 201 });
  } catch (error) {
    console.error('Error creating settlement:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
