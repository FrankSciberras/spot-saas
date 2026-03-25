import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * GET /api/vehicle-diagrams?model=yaris-cross&view=side
 * Returns zone config for a specific model + view
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const model = searchParams.get('model');
    const view = searchParams.get('view');

    if (!model || !view) {
      return NextResponse.json({ error: 'model and view query params required' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('vehicle_diagram_zones')
      .select('*')
      .eq('model_key', model)
      .eq('view_type', view)
      .single();

    if (error && error.code !== 'PGRST116') throw error; // PGRST116 = not found

    return NextResponse.json(data || null);
  } catch (err) {
    console.error('GET /api/vehicle-diagrams error:', err);
    return NextResponse.json({ error: 'Failed to fetch diagram config' }, { status: 500 });
  }
}

/**
 * GET /api/vehicle-diagrams (no params) → list all configs
 * PUT /api/vehicle-diagrams — upsert zone config
 */
export async function PUT(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Check admin
    const { data: userData } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();
    if (userData?.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const body = await request.json();
    const { model_key, view_type, zones, svg_path } = body;

    if (!model_key || !view_type || !zones) {
      return NextResponse.json({ error: 'model_key, view_type, and zones are required' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('vehicle_diagram_zones')
      .upsert(
        {
          model_key,
          view_type,
          zones,
          svg_path: svg_path || null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'model_key,view_type' }
      )
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json(data);
  } catch (err) {
    console.error('PUT /api/vehicle-diagrams error:', err);
    return NextResponse.json({ error: 'Failed to save diagram config' }, { status: 500 });
  }
}
