import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * GET /api/plans
 * Lists PUBLISHED packages (the marketing/billing catalogue). Public — RLS
 * allows anon SELECT of published rows. Ordered for display.
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('plans')
      .select('*')
      .eq('is_published', true)
      .order('sort_order', { ascending: true });

    if (error) throw error;

    return NextResponse.json({ data: data ?? [] });
  } catch (err) {
    console.error('GET /api/plans error:', err);
    return NextResponse.json({ error: 'Failed to fetch plans' }, { status: 500 });
  }
}
