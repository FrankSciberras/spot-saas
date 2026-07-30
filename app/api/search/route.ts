import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSession } from '@/lib/auth/session';

export interface SearchHit {
  id: string;
  kind: 'driver' | 'vehicle';
  label: string;
  sub: string | null;
  href: string;
}

/** Escape PostgREST `or()` filter metacharacters so a plate like "A,B" can't break the query. */
function sanitize(term: string) {
  return term.replace(/[%,()\\]/g, ' ').trim();
}

/**
 * GET /api/search?q= — topbar command-palette lookup.
 *
 * Returns drivers and vehicles in the caller's active fleet. Static page
 * navigation is resolved client-side; this only covers records.
 */
export async function GET(request: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!['admin', 'staff'].includes(session.role) && !session.also_staff) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const raw = new URL(request.url).searchParams.get('q') || '';
    const q = sanitize(raw);
    if (q.length < 2) {
      return NextResponse.json({ data: [] });
    }

    const supabase = await createClient();
    const like = `%${q}%`;

    // RLS scopes both tables to the caller's org; the explicit filter is belt-and-braces.
    const [driversRes, vehiclesRes] = await Promise.all([
      supabase
        .from('drivers')
        .select('id, full_name, phone, status')
        .eq('organization_id', session.organization_id)
        .or(`full_name.ilike.${like},phone.ilike.${like}`)
        .order('full_name')
        .limit(6),
      supabase
        .from('vehicles')
        .select('id, registration_number, make, model, status')
        .eq('organization_id', session.organization_id)
        .or(`registration_number.ilike.${like},make.ilike.${like},model.ilike.${like}`)
        .order('registration_number')
        .limit(6),
    ]);

    const hits: SearchHit[] = [];

    for (const d of driversRes.data || []) {
      hits.push({
        id: d.id,
        kind: 'driver',
        label: d.full_name,
        sub: d.phone || d.status || null,
        href: `/fleet/drivers/${d.id}`,
      });
    }

    for (const v of vehiclesRes.data || []) {
      hits.push({
        id: v.id,
        kind: 'vehicle',
        label: v.registration_number,
        sub: [v.make, v.model].filter(Boolean).join(' ') || null,
        href: `/fleet/vehicles/${v.id}`,
      });
    }

    return NextResponse.json({ data: hits });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
