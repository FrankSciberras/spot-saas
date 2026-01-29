import Link from 'next/link';
import { requireRole } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import DashboardLayout from '@/components/shared/DashboardLayout';
import type { Vehicle } from '@/lib/types/database';
import styles from '@/app/admin/vehicles/vehicles.module.css';

/**
 * Driver Vehicles List Page
 */
export default async function DriverVehiclesPage() {
  const user = await requireRole(['driver']);
  const supabase = await createClient();

  const { data: vehicles, error } = await supabase
    .from('vehicles')
    .select('*')
    .order('registration_number');

  const isExpiringSoon = (dateStr: string | null): boolean => {
    if (!dateStr) return false;
    const date = new Date(dateStr);
    const thirtyDays = new Date();
    thirtyDays.setDate(thirtyDays.getDate() + 30);
    return date <= thirtyDays;
  };

  const isExpired = (dateStr: string | null): boolean => {
    if (!dateStr) return false;
    return new Date(dateStr) < new Date();
  };

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'active':
        return 'badge-success';
      case 'in_service':
        return 'badge-warning';
      case 'out_of_service':
        return 'badge-danger';
      default:
        return 'badge-secondary';
    }
  };

  return (
    <DashboardLayout user={user} variant="driver" title="Vehicles">
      <div className={styles.container}>
        <div className={styles.header}>
          <h2>All Vehicles</h2>
        </div>

        {error && (
          <div className="alert alert-danger">Error loading vehicles: {error.message}</div>
        )}

        <div className="card">
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Registration</th>
                  <th>Make / Model</th>
                  <th>Year</th>
                  <th>Mileage</th>
                  <th>Status</th>
                  <th>Insurance</th>
                  <th>Road License</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {vehicles && vehicles.length > 0 ? (
                  vehicles.map((vehicle: Vehicle) => (
                    <tr key={vehicle.id}>
                      <td>
                        <strong>{vehicle.registration_number}</strong>
                      </td>
                      <td>
                        {vehicle.make} {vehicle.model}
                      </td>
                      <td>{vehicle.year || '-'}</td>
                      <td>{vehicle.mileage?.toLocaleString() || '-'} km</td>
                      <td>
                        <span className={`badge ${getStatusBadgeClass(vehicle.status)}`}>
                          {vehicle.status.replace('_', ' ')}
                        </span>
                      </td>
                      <td>
                        {vehicle.insurance_expiry_date ? (
                          <span
                            className={
                              isExpired(vehicle.insurance_expiry_date)
                                ? 'text-danger'
                                : isExpiringSoon(vehicle.insurance_expiry_date)
                                  ? 'text-warning'
                                  : ''
                            }
                          >
                            {vehicle.insurance_expiry_date}
                          </span>
                        ) : (
                          '-'
                        )}
                      </td>
                      <td>
                        {vehicle.road_license_expiry_date ? (
                          <span
                            className={
                              isExpired(vehicle.road_license_expiry_date)
                                ? 'text-danger'
                                : isExpiringSoon(vehicle.road_license_expiry_date)
                                  ? 'text-warning'
                                  : ''
                            }
                          >
                            {vehicle.road_license_expiry_date}
                          </span>
                        ) : (
                          '-'
                        )}
                      </td>
                      <td>
                        <div className={styles.actions}>
                          <Link
                            href={`/driver/vehicles/${vehicle.id}`}
                            className="btn btn-sm btn-outline"
                          >
                            View
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={8} className="text-center text-muted">
                      No vehicles found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
