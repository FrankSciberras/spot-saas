import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSession } from '@/lib/auth/session';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * PUT /api/vehicles/[id]/mileage
 * 
 * Update vehicle mileage - allowed for drivers when submitting shifts
 * This bypasses the normal vehicle update restrictions
 */
export async function PUT(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    
    // Check authentication
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { mileage } = body;

    if (mileage === undefined || mileage === null) {
      return NextResponse.json({ error: 'Mileage is required' }, { status: 400 });
    }

    const mileageNum = parseInt(mileage, 10);
    if (isNaN(mileageNum) || mileageNum < 0) {
      return NextResponse.json({ error: 'Invalid mileage value' }, { status: 400 });
    }

    // First verify the vehicle exists IN THE ACTIVE FLEET. The RPC below is
    // SECURITY DEFINER and only checks membership in "some" fleet, so this is
    // the gate that stops a multi-fleet user touching another fleet's vehicle.
    const { data: vehicle, error: vehicleError } = await supabase
      .from('vehicles')
      .select('id, mileage, registration_number')
      .eq('id', id)
      // active-fleet scope (RLS alone merges a multi-fleet user's orgs)
      .eq('organization_id', session.organization_id)
      .single();

    if (vehicleError || !vehicle) {
      return NextResponse.json({ error: 'Vehicle not found' }, { status: 404 });
    }

    // Only update if new mileage is higher (prevents rollback of mileage)
    if (vehicle.mileage && mileageNum < vehicle.mileage) {
      return NextResponse.json({ 
        error: `Mileage cannot be lower than current (${vehicle.mileage} km)`,
        current_mileage: vehicle.mileage
      }, { status: 400 });
    }

    // Update using RPC function (bypasses RLS)
    const { error: updateError } = await supabase.rpc('update_vehicle_mileage', {
      p_vehicle_id: id,
      p_mileage: mileageNum
    });

    if (updateError) {
      console.error('Mileage update failed:', updateError);
      return NextResponse.json({ 
        error: 'Failed to update mileage',
        details: updateError.message 
      }, { status: 500 });
    }

    return NextResponse.json({ 
      success: true, 
      mileage: mileageNum,
      vehicle_id: id 
    });

  } catch (error) {
    console.error('Error updating mileage:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
