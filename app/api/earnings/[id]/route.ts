import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

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

interface RouteParams {
  params: Promise<{ id: string }>;
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
 * GET /api/earnings/[id] - Fetch single earnings record
 */
export async function GET(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!profile || profile.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { data: earnings, error } = await supabase
      .from('monthly_earnings')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: 'Not found' }, { status: 404 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data: earnings });
  } catch (error) {
    console.error('Error in GET /api/earnings/[id]:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * PUT /api/earnings/[id] - Update earnings record
 */
export async function PUT(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!profile || profile.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body: MonthlyEarningsInput = await request.json();

    // Fetch existing to merge with updates
    const { data: existing } = await supabase
      .from('monthly_earnings')
      .select('*')
      .eq('id', id)
      .single();

    if (!existing) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // Merge existing with updates for total calculation
    const merged: MonthlyEarningsInput = {
      month: existing.month,
      bolt_gross: body.bolt_gross ?? existing.bolt_gross,
      uber_gross: body.uber_gross ?? existing.uber_gross,
      offapp_gross: body.offapp_gross ?? existing.offapp_gross,
      bolt_vat: body.bolt_vat ?? existing.bolt_vat,
      uber_vat: body.uber_vat ?? existing.uber_vat,
      offapp_vat: body.offapp_vat ?? existing.offapp_vat,
      bolt_commission: body.bolt_commission ?? existing.bolt_commission,
      uber_commission: body.uber_commission ?? existing.uber_commission,
      driver_settlements_total: body.driver_settlements_total ?? existing.driver_settlements_total,
      rent: body.rent ?? existing.rent,
      utilities: body.utilities ?? existing.utilities,
      insurance: body.insurance ?? existing.insurance,
      ni_tax: body.ni_tax ?? existing.ni_tax,
      services_total: body.services_total ?? existing.services_total,
      fuel: body.fuel ?? existing.fuel,
      vehicle_expenses: body.vehicle_expenses ?? existing.vehicle_expenses,
      other_expenses: body.other_expenses ?? existing.other_expenses,
    };

    const totals = calculateTotals(merged);

    const updateData: Record<string, unknown> = { ...totals };

    // Only include fields that were explicitly provided
    if (body.bolt_gross !== undefined) updateData.bolt_gross = body.bolt_gross;
    if (body.uber_gross !== undefined) updateData.uber_gross = body.uber_gross;
    if (body.offapp_gross !== undefined) updateData.offapp_gross = body.offapp_gross;
    if (body.bolt_vat !== undefined) updateData.bolt_vat = body.bolt_vat;
    if (body.uber_vat !== undefined) updateData.uber_vat = body.uber_vat;
    if (body.offapp_vat !== undefined) updateData.offapp_vat = body.offapp_vat;
    if (body.bolt_commission !== undefined) updateData.bolt_commission = body.bolt_commission;
    if (body.uber_commission !== undefined) updateData.uber_commission = body.uber_commission;
    if (body.driver_settlements_total !== undefined) updateData.driver_settlements_total = body.driver_settlements_total;
    if (body.rent !== undefined) updateData.rent = body.rent;
    if (body.utilities !== undefined) updateData.utilities = body.utilities;
    if (body.insurance !== undefined) updateData.insurance = body.insurance;
    if (body.ni_tax !== undefined) updateData.ni_tax = body.ni_tax;
    if (body.services_total !== undefined) updateData.services_total = body.services_total;
    if (body.fuel !== undefined) updateData.fuel = body.fuel;
    if (body.vehicle_expenses !== undefined) updateData.vehicle_expenses = body.vehicle_expenses;
    if (body.other_expenses !== undefined) updateData.other_expenses = body.other_expenses;
    if (body.other_expenses_notes !== undefined) updateData.other_expenses_notes = body.other_expenses_notes;
    if (body.notes !== undefined) updateData.notes = body.notes;
    if (body.status !== undefined) updateData.status = body.status;

    const { data: earnings, error } = await supabase
      .from('monthly_earnings')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating earnings:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data: earnings });
  } catch (error) {
    console.error('Error in PUT /api/earnings/[id]:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/earnings/[id] - Delete earnings record
 */
export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!profile || profile.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { error } = await supabase
      .from('monthly_earnings')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting earnings:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in DELETE /api/earnings/[id]:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
