import { NextResponse } from 'next/server';
import { isPlatformAdmin } from '@/lib/auth/platform';
import { createAdminClient } from '@/lib/supabase/server';

/**
 * GET /api/admin/vehicle-models — platform-admin only.
 * Returns ALL presets (incl. unpublished drafts) plus how many zones each view
 * has traced, for the Vehicle Models manager inside the admin console.
 */
export async function GET() {
  if (!(await isPlatformAdmin())) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const admin = createAdminClient();
  const [{ data: models }, { data: zoneRows }] = await Promise.all([
    admin
      .from('vehicle_models')
      .select('id, name, make, model, model_key, side_image_url, top_image_url, is_published')
      .order('name'),
    admin.from('vehicle_diagram_zones').select('model_key, view_type, zones'),
  ]);

  const sideCount = new Map<string, number>();
  const topCount = new Map<string, number>();
  for (const z of (zoneRows ?? []) as { model_key: string; view_type: string; zones: unknown }[]) {
    const n = z.zones && typeof z.zones === 'object' ? Object.keys(z.zones as object).length : 0;
    if (z.view_type === 'side') sideCount.set(z.model_key, n);
    else if (z.view_type === 'top') topCount.set(z.model_key, n);
  }

  type DbModel = {
    id: string; name: string; make: string | null; model: string | null; model_key: string;
    side_image_url: string | null; top_image_url: string | null; is_published: boolean;
  };
  const data = ((models ?? []) as DbModel[]).map((m) => ({
    ...m,
    sideZoneCount: sideCount.get(m.model_key) ?? 0,
    topZoneCount: topCount.get(m.model_key) ?? 0,
  }));

  return NextResponse.json({ data });
}
