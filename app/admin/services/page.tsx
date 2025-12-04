import Link from 'next/link';
import { requireRole } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import DashboardLayout from '@/components/shared/DashboardLayout';
import styles from './services.module.css';

interface VehicleService {
  id: string;
  vehicle_id: string;
  service_date: string;
  service_type: string;
  mileage_at_service: number;
  next_service_mileage: number | null;
  next_service_date: string | null;
  cost: number | null;
  currency: string;
  service_provider: string | null;
  description: string | null;
  vehicles: {
    id: string;
    registration_number: string;
    make: string;
    model: string;
  } | null;
}

const SERVICE_TYPE_LABELS: Record<string, string> = {
  oil_change: 'Oil Change',
  tire_rotation: 'Tire Rotation',
  tire_replacement: 'Tire Replacement',
  brake_service: 'Brake Service',
  brake_pads: 'Brake Pads',
  brake_discs: 'Brake Discs',
  air_filter: 'Air Filter',
  cabin_filter: 'Cabin Filter',
  spark_plugs: 'Spark Plugs',
  battery: 'Battery',
  transmission: 'Transmission',
  coolant_flush: 'Coolant Flush',
  timing_belt: 'Timing Belt',
  general_inspection: 'General Inspection',
  annual_service: 'Annual Service',
  major_service: 'Major Service',
  repair: 'Repair',
  other: 'Other',
};

export default async function ServicesPage() {
  const user = await requireRole(['admin', 'staff']);
  const supabase = await createClient();

  const { data: services } = await supabase
    .from('vehicle_services')
    .select(`
      *,
      vehicles:vehicle_id (id, registration_number, make, model)
    `)
    .order('service_date', { ascending: false })
    .limit(100);

  // Get vehicles needing service soon
  const { data: vehiclesData } = await supabase
    .from('vehicles')
    .select('id, registration_number, make, model, mileage');

  // Calculate upcoming services
  type VehicleData = { id: string; registration_number: string; make: string; model: string; mileage: number };
  const upcomingServices: { vehicle: VehicleData; nextMileage: number; kmRemaining: number }[] = [];
  
  if (services && vehiclesData) {
    const latestServiceByVehicle = new Map<string, VehicleService>();
    services.forEach((s: VehicleService) => {
      if (!latestServiceByVehicle.has(s.vehicle_id) && s.next_service_mileage) {
        latestServiceByVehicle.set(s.vehicle_id, s);
      }
    });

    vehiclesData.forEach(vehicle => {
      const lastService = latestServiceByVehicle.get(vehicle.id);
      if (lastService?.next_service_mileage) {
        const kmRemaining = lastService.next_service_mileage - vehicle.mileage;
        if (kmRemaining <= 2000) { // Alert when within 2000km
          upcomingServices.push({
            vehicle,
            nextMileage: lastService.next_service_mileage,
            kmRemaining,
          });
        }
      }
    });

    upcomingServices.sort((a, b) => a.kmRemaining - b.kmRemaining);
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  };

  return (
    <DashboardLayout user={user} variant="admin" title="Vehicle Services">
      <div className={styles.container}>
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <h2>Vehicle Services</h2>
            <p className={styles.subtitle}>Track maintenance and service history</p>
          </div>
          <Link href="/admin/services/new" className="btn btn-primary">
            + Add Service
          </Link>
        </div>

        {/* Upcoming Services Alert */}
        {upcomingServices.length > 0 && (
          <div className={styles.alertCard}>
            <div className={styles.alertHeader}>
              <svg viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" fill="none">
                <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              <span>Services Due Soon</span>
            </div>
            <div className={styles.alertContent}>
              {upcomingServices.slice(0, 5).map(({ vehicle, nextMileage, kmRemaining }) => (
                <div key={vehicle.id} className={styles.alertItem}>
                  <Link href={`/admin/vehicles/${vehicle.id}`} className={styles.alertVehicle}>
                    {vehicle.registration_number}
                  </Link>
                  <span className={styles.alertInfo}>
                    {vehicle.make} {vehicle.model}
                  </span>
                  <span className={`${styles.alertKm} ${kmRemaining <= 500 ? styles.urgent : ''}`}>
                    {kmRemaining <= 0 
                      ? `${Math.abs(kmRemaining).toLocaleString()} km overdue`
                      : `${kmRemaining.toLocaleString()} km remaining`
                    }
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Services List */}
        {services && services.length > 0 ? (
          <div className={styles.servicesTable}>
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Vehicle</th>
                  <th>Service Type</th>
                  <th>Mileage</th>
                  <th>Next Due</th>
                  <th>Cost</th>
                  <th>Provider</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {services.map((service: VehicleService) => (
                  <tr key={service.id}>
                    <td>{formatDate(service.service_date)}</td>
                    <td>
                      {service.vehicles ? (
                        <Link href={`/admin/vehicles/${service.vehicles.id}`} className={styles.vehicleLink}>
                          <span className={styles.vehicleReg}>{service.vehicles.registration_number}</span>
                          <span className={styles.vehicleModel}>
                            {service.vehicles.make} {service.vehicles.model}
                          </span>
                        </Link>
                      ) : (
                        <span className={styles.noVehicle}>-</span>
                      )}
                    </td>
                    <td>
                      <span className={styles.serviceType}>
                        {SERVICE_TYPE_LABELS[service.service_type] || service.service_type}
                      </span>
                    </td>
                    <td>{service.mileage_at_service.toLocaleString()} km</td>
                    <td>
                      {service.next_service_mileage ? (
                        <span>{service.next_service_mileage.toLocaleString()} km</span>
                      ) : service.next_service_date ? (
                        <span>{formatDate(service.next_service_date)}</span>
                      ) : (
                        <span className={styles.noValue}>-</span>
                      )}
                    </td>
                    <td>
                      {service.cost ? (
                        <span>{service.currency} {service.cost.toFixed(2)}</span>
                      ) : (
                        <span className={styles.noValue}>-</span>
                      )}
                    </td>
                    <td>
                      {service.service_provider || <span className={styles.noValue}>-</span>}
                    </td>
                    <td>
                      <Link href={`/admin/services/${service.id}`} className={styles.viewBtn}>
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className={styles.emptyState}>
            <svg viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5" fill="none">
              <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
            </svg>
            <h3>No service records yet</h3>
            <p>Add your first vehicle service to start tracking maintenance.</p>
            <Link href="/admin/services/new" className="btn btn-primary">
              Add Service
            </Link>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
