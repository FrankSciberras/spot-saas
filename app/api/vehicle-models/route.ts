import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * GET /api/vehicle-models
 * Lists PUBLISHED car-model presets for the fleet "Car model / diagram"
 * dropdown. Any authenticated user may read (RLS allows authenticated SELECT);
 * presets are global and managed only by the platform admin.
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data, error } = await supabase
      .from('vehicle_models')
      .select('id, name, make, model, model_key')
      .eq('is_published', true)
      .order('name');

    if (error) throw error;

    return NextResponse.json({ data: data ?? [] });
  } catch (err) {
    console.error('GET /api/vehicle-models error:', err);
    return NextResponse.json({ error: 'Failed to fetch vehicle models' }, { status: 500 });
  }
}
