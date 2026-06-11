import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSession } from '@/lib/auth/session';

/**
 * DELETE /api/settlements/bulk
 * Bulk delete settlements (and their associated platforms)
 */
export async function DELETE(request: Request) {
  const supabase = await createClient();
  const session = await getSession();

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Check if admin
  if (session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json();
  const { ids } = body;

  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: 'No settlement IDs provided' }, { status: 400 });
  }

  // Delete settlement platforms first (foreign key constraint)
  await supabase
    .from('settlement_platforms')
    .delete()
    .in('settlement_id', ids);

  // Delete settlements
  const { error } = await supabase
    .from('driver_settlements')
    .delete()
    .in('id', ids);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ 
    success: true, 
    deleted: ids.length 
  });
}

export async function PUT(request: Request) {
  const supabase = await createClient();
  const session = await getSession();

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json();
  const { ids, paid_at } = body;

  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: 'No settlement IDs provided' }, { status: 400 });
  }

  const nextPaidAt = paid_at === null ? null : typeof paid_at === 'string' ? paid_at : new Date().toISOString();

  const { error } = await supabase
    .from('driver_settlements')
    .update({ paid_at: nextPaidAt })
    .in('id', ids);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    updated: ids.length,
    paid_at: nextPaidAt,
  });
}
