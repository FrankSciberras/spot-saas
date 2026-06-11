import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSession } from '@/lib/auth/session';
import type { UpdateAdjustmentInput } from '@/lib/types/database';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/adjustments/[id] - Get a single adjustment
 */
export async function GET(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    
    // Check auth
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: adjustment, error } = await supabase
      .from('driver_adjustments')
      .select(`
        *,
        drivers:driver_id (id, full_name)
      `)
      .eq('id', id)
      .single();

    if (error) {
      return NextResponse.json({ error: 'Adjustment not found' }, { status: 404 });
    }

    return NextResponse.json({ data: adjustment });
  } catch (error) {
    console.error('Error fetching adjustment:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/adjustments/[id] - Update an adjustment
 * Requires admin role
 */
export async function PUT(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const supabase = await createClient();

    // Check auth - only admin can update adjustments
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (session.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Parse request body
    const body: UpdateAdjustmentInput = await request.json();

    // Validate type if provided
    if (body.type) {
      const validTypes = ['expense', 'bonus', 'deduction', 'reimbursement', 'other'];
      if (!validTypes.includes(body.type)) {
        return NextResponse.json(
          { error: `Invalid type. Must be one of: ${validTypes.join(', ')}` },
          { status: 400 }
        );
      }
    }

    // Build update object
    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (body.type !== undefined) updateData.type = body.type;
    if (body.amount !== undefined) updateData.amount = body.amount;
    if (body.description !== undefined) updateData.description = body.description;
    if (body.date !== undefined) updateData.date = body.date;
    if (body.notes !== undefined) updateData.notes = body.notes || null;

    // Update adjustment
    const { data: adjustment, error } = await supabase
      .from('driver_adjustments')
      .update(updateData)
      .eq('id', id)
      .select(`
        *,
        drivers:driver_id (id, full_name)
      `)
      .single();

    if (error) {
      console.error('Adjustment update error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data: adjustment });
  } catch (error) {
    console.error('Error updating adjustment:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/adjustments/[id] - Delete an adjustment
 * Requires admin role
 */
export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const supabase = await createClient();

    // Check auth - only admin can delete adjustments
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (session.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Delete adjustment
    const { error } = await supabase
      .from('driver_adjustments')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Adjustment delete error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting adjustment:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
