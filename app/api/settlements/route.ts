import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSession } from '@/lib/auth/session';
import type { CreateSettlementInput } from '@/lib/types/database';
import { calculateSettlement, round2, type PlatformEarningsInput } from '@/lib/utils/settlementCalculations';
import { resolveComponents, resolveScheme, schemeFromPreset, type PresetLike } from '@/lib/config/settlements';
import { calculateAdjustmentsNet } from '@/lib/utils/adjustments';
import type { AdjustmentType, RecurringAmountType } from '@/lib/types/database';

const SCHEME_COLUMNS =
  'settlement_driver_share_pct, settlement_tips_driver_pct, settlement_campaigns_driver_pct, settlement_fee_driver_pct';
const PRESET_COLUMNS =
  'driver_share_pct, tips_driver_pct, campaigns_driver_pct, fee_driver_pct, tax_type, tax_value, rent_weekly, hourly_rate, fixed_wage_weekly, components';

/**
 * GET /api/settlements - List settlements
 * Query params: driver_id, week_start, status
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
    } else if (session.role === 'driver') {
      // Drivers can only see their own settlements
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

    // Check auth - only admin can create settlements
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (session.role !== 'admin') {
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

    // Resolve the effective settlement scheme for this driver. Preset chain
    // first (driver's preset -> fleet default preset), then the legacy
    // column-based scheme (driver overrides -> org defaults -> code default).
    const { data: driverRow } = await supabase
      .from('drivers')
      .select(`organization_id, settlement_preset_id, ${SCHEME_COLUMNS}`)
      .eq('id', body.driver_id)
      .single();

    let orgDefaults: Record<string, unknown> | null = null;
    let presetId: string | null = driverRow?.settlement_preset_id ?? null;
    if (driverRow?.organization_id) {
      const { data: org } = await supabase
        .from('organizations')
        .select(`default_settlement_preset_id, ${SCHEME_COLUMNS}`)
        .eq('id', driverRow.organization_id)
        .single();
      orgDefaults = org;
      if (!presetId) presetId = (org?.default_settlement_preset_id as string | null) ?? null;
    }

    let preset: PresetLike | null = null;
    if (presetId) {
      const { data: presetRow } = await supabase
        .from('settlement_presets')
        .select(PRESET_COLUMNS)
        .eq('id', presetId)
        .maybeSingle();
      preset = presetRow as PresetLike | null;
    }

    const scheme = preset ? schemeFromPreset(preset) : resolveScheme(orgDefaults, driverRow);
    const rent = preset ? Math.max(0, preset.rent_weekly || 0) : 0;
    // Component toggles + wage rates from the preset ({} / no preset = legacy
    // split, wage lines off). Hours come from the client (prefilled from
    // shifts, editable by the operator).
    const components = resolveComponents(preset?.components);
    const wage = {
      components,
      hoursWorked: Math.max(0, Number(body.hours_worked) || 0),
      hourlyRate: preset ? Math.max(0, Number(preset.hourly_rate) || 0) : 0,
      fixedWageWeekly: preset ? Math.max(0, Number(preset.fixed_wage_weekly) || 0) : 0,
    };

    // Calculate totals from platform data
    const platformInputs: PlatformEarningsInput[] = (body.platforms || []).map(p => ({
      platformId: p.platform_id,
      grossFare: p.gross_fare,
      platformFeePercent: p.platform_fee_percent,
      cashRide: p.cash_ride,
      tips: p.tips,
      campaigns: p.campaigns || 0,
    }));

    const calculation = calculateSettlement(platformInputs, body.fss_tax, scheme, rent, wage);

    // Materialize recurring adjustment rules into real driver_adjustments rows
    // for this driver+period, so they're frozen alongside any manual ones below.
    // Deduped by (rule, period) so re-creating a deleted settlement won't double.
    if (driverRow?.organization_id) {
      const { data: rules } = await supabase
        .from('recurring_adjustments')
        .select('id, type, amount_type, amount, description')
        .eq('organization_id', driverRow.organization_id)
        .eq('active', true)
        .or(`driver_id.is.null,driver_id.eq.${body.driver_id}`)
        .lte('start_date', body.week_end)
        .or(`end_date.is.null,end_date.gte.${body.week_start}`);

      if (rules && rules.length > 0) {
        // Which rules already have a row for this driver in this period?
        const { data: alreadyMaterialized } = await supabase
          .from('driver_adjustments')
          .select('recurring_rule_id')
          .eq('driver_id', body.driver_id)
          .gte('date', body.week_start)
          .lte('date', body.week_end)
          .not('recurring_rule_id', 'is', null);
        const seen = new Set((alreadyMaterialized || []).map((r) => r.recurring_rule_id));

        const newRows = rules
          .filter((rule) => !seen.has(rule.id))
          .map((rule) => {
            const amountType = rule.amount_type as RecurringAmountType;
            const amount = amountType === 'percent_of_gross'
              ? round2((calculation.totalGrossFare * (Number(rule.amount) || 0)) / 100)
              : round2(Number(rule.amount) || 0);
            return { rule, amount };
          })
          .filter(({ amount }) => amount > 0)
          .map(({ rule, amount }) => ({
            driver_id: body.driver_id,
            type: rule.type as AdjustmentType,
            amount,
            description: rule.description,
            date: body.week_start,
            recurring_rule_id: rule.id,
          }));

        if (newRows.length > 0) {
          const { error: genError } = await supabase.from('driver_adjustments').insert(newRows);
          if (genError) {
            console.error('Recurring adjustment generation error:', genError);
            // Non-fatal: continue without the generated rows.
          }
        }
      }
    }

    // Freeze adjustments: gather the driver's unattached adjustments that fall in
    // this settlement's period, so we can snapshot their net and link them below.
    const { data: pendingAdjustments } = await supabase
      .from('driver_adjustments')
      .select('id, type, amount')
      .eq('driver_id', body.driver_id)
      .is('settlement_id', null)
      .gte('date', body.week_start)
      .lte('date', body.week_end);
    const adjustmentRows = pendingAdjustments || [];
    const totalAdjustments = calculateAdjustmentsNet(adjustmentRows);

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
        rent_amount: calculation.rent,
        // Frozen wage snapshot: the fully-resolved component set + the numbers
        // this settlement was actually priced with.
        hours_worked: calculation.hoursWorked,
        hourly_rate: calculation.hourlyRate,
        wage_amount: calculation.wageAmount,
        components,
        total_adjustments: totalAdjustments,
        total_gross_fare: calculation.totalGrossFare,
        total_net: calculation.totalNet,
        total_balance_before_tax: calculation.totalBalanceBeforeTax,
        final_balance: calculation.finalBalance,
        status: body.status || 'draft',
        notes: body.notes || null,
        created_by: session.id,
      })
      .select()
      .single();

    if (settlementError) {
      console.error('Settlement creation error:', settlementError);
      return NextResponse.json({ error: settlementError.message }, { status: 500 });
    }

    // Link the frozen adjustments to this settlement so they can't be re-counted
    // by another settlement and stay tied to this record's snapshot.
    if (adjustmentRows.length > 0) {
      const { error: linkError } = await supabase
        .from('driver_adjustments')
        .update({ settlement_id: settlement.id })
        .in('id', adjustmentRows.map((a) => a.id));
      if (linkError) {
        console.error('Adjustment link error:', linkError);
        // Non-fatal: the snapshot total is already stored on the settlement.
      }
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
