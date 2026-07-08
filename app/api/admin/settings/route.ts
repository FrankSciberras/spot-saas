import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { getPlatformAdmin } from '@/lib/auth/platform';

// app_settings rows under the bootstrap org act as PLATFORM-wide configuration
// (e.g. the weekly npm package update check). Only the platform admin may read
// or change them — not fleet admins. The service-role client is used because a
// platform admin isn't necessarily an org admin of the bootstrap org.
const PLATFORM_ORG = '00000000-0000-0000-0000-000000000001';

export async function GET() {
  try {
    const platformAdmin = await getPlatformAdmin();
    if (!platformAdmin) {
      return NextResponse.json({ error: 'Platform admin access required' }, { status: 403 });
    }

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('app_settings')
      .select('*')
      .eq('organization_id', PLATFORM_ORG)
      .order('key');

    if (error) throw error;

    return NextResponse.json(data || []);
  } catch (error) {
    console.error('Error fetching settings:', error);
    return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const platformAdmin = await getPlatformAdmin();
    if (!platformAdmin) {
      return NextResponse.json({ error: 'Platform admin access required' }, { status: 403 });
    }

    const { key, value } = await request.json();

    if (!key) {
      return NextResponse.json({ error: 'Key is required' }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('app_settings')
      .upsert(
        { organization_id: PLATFORM_ORG, key, value, updated_at: new Date().toISOString() },
        { onConflict: 'organization_id,key' }
      )
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error updating setting:', error);
    return NextResponse.json({ error: 'Failed to update setting' }, { status: 500 });
  }
}
