import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSession } from '@/lib/auth/session';
import type { UpdateSettlementInput } from '@/lib/types/database';
import { calculateSettlement, round2, type PlatformEarningsInput, type WageOptions } from '@/lib/utils/settlementCalculations';
import { resolveComponents, type SettlementScheme } from '@/lib/config/settlements';
import { calculateAdjustmentsNet } from '@/lib/utils/adjustments';

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
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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
    if (session.role === 'driver') {
      const driver = settlement.drivers as { id: string; full_name: string; user_id: string } | null;
      if (!driver || driver.user_id !== session.id) {
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

    // Check auth - only admin can update settlements
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (session.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Check if settlement exists. Pull its FROZEN scheme + rent snapshot too:
    // edits re-price against the scheme this settlement was created under,
    // never the fleet's current (possibly since-changed) preset.
    const { data: existing } = await supabase
      .from('driver_settlements')
      .select('id, status, driver_id, week_start, week_end, driver_share_pct, tips_driver_pct, campaigns_driver_pct, fee_driver_pct, rent_amount, hours_worked, hourly_rate, wage_amount, components')
      .eq('id', id)
      .single();

    if (!existing) {
      return NextResponse.json({ error: 'Settlement not found' }, { status: 404 });
    }

    const scheme: SettlementScheme = {
      driverSharePct: existing.driver_share_pct,
      tipsDriverPct: existing.tips_driver_pct,
      campaignsDriverPct: existing.campaigns_driver_pct,
      feeDriverPct: existing.fee_driver_pct,
    };
    const frozenRent = existing.rent_amount ?? 0;
    // Frozen wage snapshot: edits re-price with the components + hourly rate
    // this settlement was created under. Only the hours can change (the frozen
    // fixed-wage part is wage_amount − rate × hours).
    const frozenComponents = resolveComponents(existing.components);
    const frozenHourlyRate = Math.max(0, Number(existing.hourly_rate) || 0);
    const frozenHours = Math.max(0, Number(existing.hours_worked) || 0);
    const frozenFixedWage = Math.max(
      0,
      round2((Number(existing.wage_amount) || 0) - round2(frozenHourlyRate * frozenHours))
    );

    // Re-freeze adjustments: release any currently linked to this settlement,
    // then re-capture the driver's unattached adjustments in this period. This
    // lets a re-save pick up adjustments added since the settlement was created
    // while keeping the snapshot tied to (and recomputed for) THIS record.
    await supabase
      .from('driver_adjustments')
      .update({ settlement_id: null })
      .eq('settlement_id', id);

    const { data: pendingAdjustments } = await supabase
      .from('driver_adjustments')
      .select('id, type, amount')
      .eq('driver_id', existing.driver_id)
      .is('settlement_id', null)
      .gte('date', existing.week_start)
      .lte('date', existing.week_end);
    const adjustmentRows = pendingAdjustments || [];
    const totalAdjustments = calculateAdjustmentsNet(adjustmentRows);

    if (adjustmentRows.length > 0) {
      await supabase
        .from('driver_adjustments')
        .update({ settlement_id: id })
        .in('id', adjustmentRows.map((a) => a.id));
    }

    // Parse request body
    const body: UpdateSettlementInput = await request.json();

    // Calculate new totals if platforms are provided
    let updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
      total_adjustments: totalAdjustments,
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

    // Wage inputs for re-pricing: frozen components/rate/fixed part, with the
    // hours editable per settlement (falls back to the stored hours).
    const wage: WageOptions = {
      components: frozenComponents,
      hoursWorked: body.hours_worked !== undefined
        ? Math.max(0, Number(body.hours_worked) || 0)
        : frozenHours,
      hourlyRate: frozenHourlyRate,
      fixedWageWeekly: frozenFixedWage,
    };

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
      const calculation = calculateSettlement(platformInputs, fssTax, scheme, frozenRent, wage);

      updateData = {
        ...updateData,
        fss_tax: calculation.fssTax,
        hours_worked: calculation.hoursWorked,
        wage_amount: calculation.wageAmount,
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
    } else if (body.fss_tax !== undefined || body.hours_worked !== undefined) {
      // Just update FSS/Tax and/or hours without new platform figures
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

      // Keep the stored tax when only the hours changed.
      const { data: taxRow } = body.fss_tax === undefined
        ? await supabase.from('driver_settlements').select('fss_tax').eq('id', id).single()
        : { data: null };
      const effTax = body.fss_tax ?? taxRow?.fss_tax ?? 0;

      const calculation = calculateSettlement(platformInputs, effTax, scheme, frozenRent, wage);

      updateData = {
        ...updateData,
        fss_tax: calculation.fssTax,
        hours_worked: calculation.hoursWorked,
        wage_amount: calculation.wageAmount,
        total_balance_before_tax: calculation.totalBalanceBeforeTax,
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

    // Check auth - only admin can delete settlements
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (session.role !== 'admin') {
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
