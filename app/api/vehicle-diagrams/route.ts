import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isPlatformAdmin } from '@/lib/auth/platform';

/**
 * GET /api/vehicle-diagrams?model=toyota-yaris-cross&view=side
 * Returns the traced zone config for a model + view, plus the preset's uploaded
 * image for that view (so the zone editor can trace over the real car image).
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const modelKey = searchParams.get('model');
    const view = searchParams.get('view');

    if (!modelKey || !view) {
      return NextResponse.json({ error: 'model and view query params required' }, { status: 400 });
    }

    const [{ data: zoneRow, error }, { data: modelRow }] = await Promise.all([
      supabase
        .from('vehicle_diagram_zones')
        .select('*')
        .eq('model_key', modelKey)
        .eq('view_type', view)
        .single(),
      supabase
        .from('vehicle_models')
        .select('name, side_image_url, top_image_url')
        .eq('model_key', modelKey)
        .maybeSingle(),
    ]);

    if (error && error.code !== 'PGRST116') throw error; // PGRST116 = not found

    const imageUrl = view === 'top' ? modelRow?.top_image_url : modelRow?.side_image_url;

    return NextResponse.json({
      model_key: modelKey,
      view_type: view,
      zones: zoneRow?.zones ?? {},
      svg_path: zoneRow?.svg_path ?? null,
      image_url: imageUrl ?? null,
      model_name: modelRow?.name ?? null,
    });
  } catch (err) {
    console.error('GET /api/vehicle-diagrams error:', err);
    return NextResponse.json({ error: 'Failed to fetch diagram config' }, { status: 500 });
  }
}

/**
 * PUT /api/vehicle-diagrams — upsert a model's traced zones (one row per view).
 * PLATFORM admins only (the SaaS operator). A fleet's own admin may NOT edit the
 * shared diagrams — they only pick a preset for their vehicles.
 */
export async function PUT(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    if (!(await isPlatformAdmin())) {
      return NextResponse.json({ error: 'Platform admin access required' }, { status: 403 });
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
