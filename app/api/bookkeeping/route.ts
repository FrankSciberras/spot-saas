import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { WeeklyBookkeepingInput } from '@/lib/types/database';

/**
 * Calculate totals from input data
 */
function calculateTotals(data: WeeklyBookkeepingInput) {
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
 * GET /api/bookkeeping - Fetch all weekly bookkeeping entries
 */
export async function GET() {
  try {
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

    const { data: entries, error } = await supabase
      .from('weekly_bookkeeping')
      .select('*')
      .order('week_start', { ascending: false });

    if (error) {
      console.error('Error fetching bookkeeping:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data: entries });
  } catch (error) {
    console.error('Error in GET /api/bookkeeping:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/bookkeeping - Create new weekly bookkeeping entry
 */
export async function POST(request: Request) {
  try {
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

    const body: WeeklyBookkeepingInput = await request.json();

    if (!body.week_start || !body.week_end || !body.week_label) {
      return NextResponse.json({ error: 'week_start, week_end, and week_label are required' }, { status: 400 });
    }

    // Check for existing record with same date range
    const { data: existing } = await supabase
      .from('weekly_bookkeeping')
      .select('id')
      .eq('week_start', body.week_start)
      .eq('week_end', body.week_end)
      .single();

    if (existing) {
      return NextResponse.json(
        { error: 'Entry already exists for this date range' },
        { status: 409 }
      );
    }

    const totals = calculateTotals(body);

    const { data: entry, error } = await supabase
      .from('weekly_bookkeeping')
      .insert({
        week_start: body.week_start,
        week_end: body.week_end,
        week_label: body.week_label,
        period_name: body.period_name || null,
        uber_earnings: body.uber_earnings || 0,
        bolt_earnings: body.bolt_earnings || 0,
        ecabs_earnings: body.ecabs_earnings || 0,
        other_earnings: body.other_earnings || 0,
        employees: body.employees || 0,
        repairs: body.repairs || 0,
        insurance: body.insurance || 0,
        investments: body.investments || 0,
        vat: body.vat || 0,
        rent: body.rent || 0,
        employee_tax: body.employee_tax || 0,
        other_expenses: body.other_expenses || 0,
        notes: body.notes || null,
        created_by: user.id,
        ...totals,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating bookkeeping entry:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data: entry }, { status: 201 });
  } catch (error) {
    console.error('Error in POST /api/bookkeeping:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
