import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { UpdateSettlementInput } from '@/lib/types/database';
import { calculateSettlement, type PlatformEarningsInput } from '@/lib/utils/settlementCalculations';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/settlements/[id] - Get a single settlement
 */
export async function GET(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    
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

    // Fetch settlement
    const { data: settlement, error } = await supabase
      .from('driver_settlements')
      .select(`
        *,
        drivers:driver_id (id, full_name, user_id),
        settlement_platforms (*)
      `)
      .eq('id', id)
      .single();

    if (error || !settlement) {
      return NextResponse.json({ error: 'Settlement not found' }, { status: 404 });
    }

    // Drivers can only view their own settlements
    if (profile.role === 'driver') {
      const driver = settlement.drivers as { id: string; full_name: string; user_id: string } | null;
      if (!driver || driver.user_id !== user.id) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    return NextResponse.json({ data: settlement });
  } catch (error) {
    console.error('Error fetching settlement:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/settlements/[id] - Update a settlement
 * Requires admin role
 */
export async function PUT(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    
    // Check auth
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check role - only admin can update settlements
    const { data: profile } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!profile || profile.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Check if settlement exists
    const { data: existing } = await supabase
      .from('driver_settlements')
      .select('id, status')
      .eq('id', id)
      .single();

    if (!existing) {
      return NextResponse.json({ error: 'Settlement not found' }, { status: 404 });
    }

    // Parse request body
    const body: UpdateSettlementInput = await request.json();

    // Calculate new totals if platforms are provided
    let updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (body.period_name !== undefined) {
      updateData.period_name = body.period_name;
    }

    if (body.settlement_month !== undefined) {
      updateData.settlement_month = body.settlement_month;
    }

    if (body.notes !== undefined) {
      updateData.notes = body.notes;
    }

    if (body.status !== undefined) {
      updateData.status = body.status;
    }

    if (body.paid_at !== undefined) {
      updateData.paid_at = body.paid_at;
    }

    if (body.platforms !== undefined) {
      const platformInputs: PlatformEarningsInput[] = body.platforms.map(p => ({
        platformId: p.platform_id,
        grossFare: p.gross_fare,
        platformFeePercent: p.platform_fee_percent,
        cashRide: p.cash_ride,
        tips: p.tips,
        campaigns: p.campaigns || 0,
      }));

      const fssTax = body.fss_tax ?? 0;
      const calculation = calculateSettlement(platformInputs, fssTax);

      updateData = {
        ...updateData,
        fss_tax: calculation.fssTax,
        total_gross_fare: calculation.totalGrossFare,
        total_net: calculation.totalNet,
        total_balance_before_tax: calculation.totalBalanceBeforeTax,
        final_balance: calculation.finalBalance,
      };

      // Delete existing platforms and insert new ones
      await supabase
        .from('settlement_platforms')
        .delete()
        .eq('settlement_id', id);

      if (body.platforms.length > 0) {
        const platformRecords = calculation.platforms.map((p, idx) => ({
          settlement_id: id,
          platform_id: p.platformId,
          platform_name: body.platforms![idx].platform_name,
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
          console.error('Platform update error:', platformError);
          return NextResponse.json({ error: platformError.message }, { status: 500 });
        }
      }
    } else if (body.fss_tax !== undefined) {
      // Just update FSS/Tax without recalculating platforms
      const { data: platforms } = await supabase
        .from('settlement_platforms')
        .select('*')
        .eq('settlement_id', id);

      const platformInputs: PlatformEarningsInput[] = (platforms || []).map(p => ({
        platformId: p.platform_id,
        grossFare: p.gross_fare,
        platformFeePercent: p.platform_fee_percent,
        cashRide: p.cash_ride,
        tips: p.tips,
        campaigns: p.campaigns || 0,
      }));

      const calculation = calculateSettlement(platformInputs, body.fss_tax);

      updateData = {
        ...updateData,
        fss_tax: calculation.fssTax,
        final_balance: calculation.finalBalance,
      };
    }

    // Update settlement
    const { error: updateError } = await supabase
      .from('driver_settlements')
      .update(updateData)
      .eq('id', id);

    if (updateError) {
      console.error('Settlement update error:', updateError);
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    // Fetch updated settlement
    const { data: updatedSettlement } = await supabase
      .from('driver_settlements')
      .select(`
        *,
        drivers:driver_id (id, full_name),
        settlement_platforms (*)
      `)
      .eq('id', id)
      .single();

    return NextResponse.json({ data: updatedSettlement });
  } catch (error) {
    console.error('Error updating settlement:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/settlements/[id] - Delete a settlement
 * Requires admin role
 */
export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    
    // Check auth
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check role - only admin can delete settlements
    const { data: profile } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!profile || profile.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Delete platforms first (foreign key constraint)
    await supabase
      .from('settlement_platforms')
      .delete()
      .eq('settlement_id', id);

    // Delete settlement
    const { error } = await supabase
      .from('driver_settlements')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Settlement delete error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting settlement:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
