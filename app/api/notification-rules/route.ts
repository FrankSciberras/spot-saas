import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSession, isAdminOrStaff } from '@/lib/auth/session';

/**
 * GET /api/notification-rules
 * List all notification rules
 */
export async function GET() {
  const supabase = await createClient();
  const session = await getSession();

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!isAdminOrStaff(session)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data: rules, error } = await supabase
    .from('notification_rules')
    .select('*')
    .order('trigger_type')
    .order('name');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data: rules });
}

/**
 * POST /api/notification-rules
 * Create a new notification rule
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const session = await getSession();

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json();

  const { data: rule, error } = await supabase
    .from('notification_rules')
    .insert({
      organization_id: session.organization_id,
      name: body.name,
      description: body.description,
      trigger_type: body.trigger_type,
      channel: body.channel,
      is_active: body.is_active ?? true,
      trigger_config: body.trigger_config || {},
      title_template: body.title_template,
      body_template: body.body_template,
      target_role: body.target_role || 'driver',
      created_by: session.id,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data: rule }, { status: 201 });
}
