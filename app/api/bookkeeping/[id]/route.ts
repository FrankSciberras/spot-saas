import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSession } from '@/lib/auth/session';
import type { WeeklyBookkeepingInput } from '@/lib/types/database';

/**
 * Calculate totals from input data
 */
function calculateTotals(data: Partial<WeeklyBookkeepingInput>) {
  const uberEarnings = data.uber_earnings || 0;
  const boltEarnings = data.bolt_earnings || 0;
  const ecabsEarnings = data.ecabs_earnings || 0;
  const otherEarnings = data.other_earnings || 0;
  
  const employees = data.employees || 0;
  const repairs = data.repairs || 0;
  const insurance = data.insurance || 0;
  const investments = data.investments || 0;
  const vat = data.vat || 0;
  const rent = data.rent || 0;
  const employeeTax = data.employee_tax || 0;
  const otherExpenses = data.other_expenses || 0;
  
  const totalIncome = uberEarnings + boltEarnings + ecabsEarnings + otherEarnings;
  const totalExpenses = employees + repairs + insurance + investments + vat + rent + employeeTax + otherExpenses;
  const netProfit = totalIncome - totalExpenses;
  
  return {
    total_income: Math.round(totalIncome * 100) / 100,
    total_expenses: Math.round(totalExpenses * 100) / 100,
    net_profit: Math.round(netProfit * 100) / 100,
  };
}

/**
 * GET /api/bookkeeping/[id] - Get a single entry
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

    const { data: entry, error } = await supabase
      .from('weekly_bookkeeping')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      console.error('Error fetching entry:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!entry) {
      return NextResponse.json({ error: 'Entry not found' }, { status: 404 });
    }

    return NextResponse.json({ data: entry });
  } catch (error) {
    console.error('Error in GET /api/bookkeeping/[id]:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * PUT /api/bookkeeping/[id] - Update an entry
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

    const body: Partial<WeeklyBookkeepingInput> = await request.json();

    // Get existing entry to merge values
    const { data: existing, error: fetchError } = await supabase
      .from('weekly_bookkeeping')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !existing) {
      return NextResponse.json({ error: 'Entry not found' }, { status: 404 });
    }

    // Merge existing with updates for calculation
    const merged = {
      uber_earnings: body.uber_earnings ?? existing.uber_earnings,
      bolt_earnings: body.bolt_earnings ?? existing.bolt_earnings,
      ecabs_earnings: body.ecabs_earnings ?? existing.ecabs_earnings,
      other_earnings: body.other_earnings ?? existing.other_earnings,
      employees: body.employees ?? existing.employees,
      repairs: body.repairs ?? existing.repairs,
      insurance: body.insurance ?? existing.insurance,
      investments: body.investments ?? existing.investments,
      vat: body.vat ?? existing.vat,
      rent: body.rent ?? existing.rent,
      employee_tax: body.employee_tax ?? existing.employee_tax,
      other_expenses: body.other_expenses ?? existing.other_expenses,
    };

    const totals = calculateTotals(merged);

    const { data: entry, error } = await supabase
      .from('weekly_bookkeeping')
      .update({
        week_start: body.week_start ?? existing.week_start,
        week_end: body.week_end ?? existing.week_end,
        week_label: body.week_label ?? existing.week_label,
        period_name: body.period_name !== undefined ? body.period_name : existing.period_name,
        uber_earnings: merged.uber_earnings,
        bolt_earnings: merged.bolt_earnings,
        ecabs_earnings: merged.ecabs_earnings,
        other_earnings: merged.other_earnings,
        employees: merged.employees,
        repairs: merged.repairs,
        insurance: merged.insurance,
        investments: merged.investments,
        vat: merged.vat,
        rent: merged.rent,
        employee_tax: merged.employee_tax,
        other_expenses: merged.other_expenses,
        notes: body.notes !== undefined ? body.notes : existing.notes,
        ...totals,
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating entry:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data: entry });
  } catch (error) {
    console.error('Error in PUT /api/bookkeeping/[id]:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/bookkeeping/[id] - Delete an entry
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
      .from('weekly_bookkeeping')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting entry:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in DELETE /api/bookkeeping/[id]:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
