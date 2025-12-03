import Link from 'next/link';
import { requireRole } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import DashboardLayout from '@/components/shared/DashboardLayout';
import type { Driver, Vehicle } from '@/lib/types/database';
import styles from './drivers.module.css';

interface DriverWithVehicle extends Driver {
  vehicles: Vehicle | null;
}

/**
 * Admin Drivers List Page
 */
export default async function DriversPage() {
  const user = await requireRole(['admin', 'staff']);
  const supabase = await createClient();

  const { data: drivers, error } = await supabase
    .from('drivers')
    .select(`
      *,
      vehicles:assigned_vehicle_id (
        id,
        registration_number,
        make,
        model
      )
    `)
    .order('full_name');

  const isAdmin = user.role === 'admin';

  // Helper function to check if date is expiring soon (within 30 days)
  const isExpiringSoon = (dateStr: string | null): boolean => {
    if (!dateStr) return false;
    const date = new Date(dateStr);
    const now = new Date();
    const thirtyDays = new Date();
    thirtyDays.setDate(now.getDate() + 30);
    return date <= thirtyDays;
  };

  const isExpired = (dateStr: string | null): boolean => {
    if (!dateStr) return false;
    return new Date(dateStr) < new Date();
  };

  return (
    <DashboardLayout user={user} variant="admin" title="Drivers">
      <div className={styles.container}>
        <div className={styles.header}>
          <h2>All Drivers</h2>
          {isAdmin && (
            <Link href="/admin/drivers/new" className="btn btn-primary">
              + Add Driver
            </Link>
          )}
        </div>

        {error && (
          <div className="alert alert-danger">
            Error loading drivers: {error.message}
          </div>
        )}

        <div className="card">
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Phone</th>
                  <th>Status</th>
                  <th>Assigned Vehicle</th>
                  <th>ID Card</th>
                  <th>Police Conduct</th>
                  <th>License</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {drivers && drivers.length > 0 ? (
                  drivers.map((driver: DriverWithVehicle) => (
                    <tr key={driver.id}>
                      <td>
                        <strong>{driver.full_name}</strong>
                      </td>
                      <td>{driver.phone || '-'}</td>
                      <td>
                        <span className={`badge ${driver.status === 'active' ? 'badge-success' : 'badge-secondary'}`}>
                          {driver.status}
                        </span>
                      </td>
                      <td>
                        {driver.vehicles ? (
                          <span>{driver.vehicles.registration_number}</span>
                        ) : (
                          <span className="text-muted">Not assigned</span>
                        )}
                      </td>
                      <td>
                        {driver.id_card_expiry_date ? (
                          <span className={
                            isExpired(driver.id_card_expiry_date) ? 'text-danger' :
                            isExpiringSoon(driver.id_card_expiry_date) ? 'text-warning' : ''
                          }>
                            {driver.id_card_expiry_date}
                          </span>
                        ) : '-'}
                      </td>
                      <td>
                        {driver.police_conduct_expiry_date ? (
                          <span className={
                            isExpired(driver.police_conduct_expiry_date) ? 'text-danger' :
                            isExpiringSoon(driver.police_conduct_expiry_date) ? 'text-warning' : ''
                          }>
                            {driver.police_conduct_expiry_date}
                          </span>
                        ) : '-'}
                      </td>
                      <td>
                        {driver.driving_license_expiry_date ? (
                          <span className={
                            isExpired(driver.driving_license_expiry_date) ? 'text-danger' :
                            isExpiringSoon(driver.driving_license_expiry_date) ? 'text-warning' : ''
                          }>
                            {driver.driving_license_expiry_date}
                          </span>
                        ) : '-'}
                      </td>
                      <td>
                        <div className={styles.actions}>
                          <Link href={`/admin/drivers/${driver.id}`} className="btn btn-sm btn-outline">
                            View
                          </Link>
                          {isAdmin && (
                            <Link href={`/admin/drivers/${driver.id}/edit`} className="btn btn-sm btn-secondary">
                              Edit
                            </Link>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={8} className="text-center text-muted">
                      No drivers found.
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
