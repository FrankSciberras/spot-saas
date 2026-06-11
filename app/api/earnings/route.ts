import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSession } from '@/lib/auth/session';

interface MonthlyEarningsInput {
  month: string;
  bolt_gross?: number;
  uber_gross?: number;
  offapp_gross?: number;
  bolt_vat?: number;
  uber_vat?: number;
  offapp_vat?: number;
  bolt_commission?: number;
  uber_commission?: number;
  driver_settlements_total?: number;
  rent?: number;
  utilities?: number;
  insurance?: number;
  ni_tax?: number;
  services_total?: number;
  fuel?: number;
  vehicle_expenses?: number;
  other_expenses?: number;
  other_expenses_notes?: string;
  notes?: string;
  status?: string;
}

/**
 * Calculate totals from input data
 */
function calculateTotals(data: MonthlyEarningsInput) {
  const boltGross = data.bolt_gross || 0;
  const uberGross = data.uber_gross || 0;
  const offappGross = data.offapp_gross || 0;
  
  const boltVat = data.bolt_vat || 0;
  const uberVat = data.uber_vat || 0;
  const offappVat = data.offapp_vat || 0;
  
  const boltCommission = data.bolt_commission || 0;
  const uberCommission = data.uber_commission || 0;
  
  const driverSettlements = data.driver_settlements_total || 0;
  const rent = data.rent || 0;
  const utilities = data.utilities || 0;
  const insurance = data.insurance || 0;
  const niTax = data.ni_tax || 0;
  const servicesTotal = data.services_total || 0;
  const fuel = data.fuel || 0;
  const vehicleExpenses = data.vehicle_expenses || 0;
  const otherExpenses = data.other_expenses || 0;
  
  const totalGrossRevenue = boltGross + uberGross + offappGross;
  const totalVat = boltVat + uberVat + offappVat;
  const totalCommissions = boltCommission + uberCommission;
  const netRevenue = totalGrossRevenue - totalVat - totalCommissions;
  const totalExpenses = driverSettlements + rent + utilities + insurance + niTax + servicesTotal + fuel + vehicleExpenses + otherExpenses;
  const netProfit = netRevenue - totalExpenses;
  
  return {
    total_gross_revenue: Math.round(totalGrossRevenue * 100) / 100,
    total_vat: Math.round(totalVat * 100) / 100,
    total_commissions: Math.round(totalCommissions * 100) / 100,
    net_revenue: Math.round(netRevenue * 100) / 100,
    total_expenses: Math.round(totalExpenses * 100) / 100,
    net_profit: Math.round(netProfit * 100) / 100,
  };
}

/**
 * GET /api/earnings - Fetch all monthly earnings
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

    const { data: earnings, error } = await supabase
      .from('monthly_earnings')
      .select('*')
      .order('month', { ascending: false });

    if (error) {
      console.error('Error fetching earnings:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data: earnings });
  } catch (error) {
    console.error('Error in GET /api/earnings:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/earnings - Create new monthly earnings record
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

    const body: MonthlyEarningsInput = await request.json();

    if (!body.month) {
      return NextResponse.json({ error: 'month is required' }, { status: 400 });
    }

    // Check for existing record
    const { data: existing } = await supabase
      .from('monthly_earnings')
      .select('id')
      .eq('month', body.month)
      .single();

    if (existing) {
      return NextResponse.json(
        { error: 'Earnings record already exists for this month' },
        { status: 409 }
      );
    }

    const totals = calculateTotals(body);

    const { data: earnings, error } = await supabase
      .from('monthly_earnings')
      .insert({
        month: body.month,
        bolt_gross: body.bolt_gross || 0,
        uber_gross: body.uber_gross || 0,
        offapp_gross: body.offapp_gross || 0,
        bolt_vat: body.bolt_vat || 0,
        uber_vat: body.uber_vat || 0,
        offapp_vat: body.offapp_vat || 0,
        bolt_commission: body.bolt_commission || 0,
        uber_commission: body.uber_commission || 0,
        driver_settlements_total: body.driver_settlements_total || 0,
        rent: body.rent || 0,
        utilities: body.utilities || 0,
        insurance: body.insurance || 0,
        ni_tax: body.ni_tax || 0,
        services_total: body.services_total || 0,
        fuel: body.fuel || 0,
        vehicle_expenses: body.vehicle_expenses || 0,
        other_expenses: body.other_expenses || 0,
        other_expenses_notes: body.other_expenses_notes || null,
        notes: body.notes || null,
        status: body.status || 'draft',
        created_by: session.id,
        ...totals,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating earnings:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data: earnings }, { status: 201 });
  } catch (error) {
    console.error('Error in POST /api/earnings:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
