'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import styles from './ServicesFilter.module.css';

interface Vehicle {
  id: string;
  registration_number: string;
  make: string;
  model: string;
}

interface ServicesFilterProps {
  vehicles: Vehicle[];
  serviceTypes: Record<string, string>;
  currentVehicleId?: string;
  currentServiceType?: string;
  currentSort?: string;
}

export default function ServicesFilter({
  vehicles,
  serviceTypes,
  currentVehicleId,
  currentServiceType,
  currentSort,
}: ServicesFilterProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const updateFilter = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    
    router.push(`/fleet/services?${params.toString()}`);
  };

  const clearFilters = () => {
    router.push('/fleet/services');
  };

  const hasFilters = currentVehicleId || currentServiceType || currentSort;

  return (
    <div className={styles.filterBar}>
      <div className={styles.filters}>
        {/* Vehicle Filter */}
        <div className={styles.filterGroup}>
          <label htmlFor="vehicle-filter">Vehicle</label>
          <select
            id="vehicle-filter"
            value={currentVehicleId || ''}
            onChange={(e) => updateFilter('vehicle_id', e.target.value)}
            className={styles.select}
          >
            <option value="">All Vehicles</option>
            {vehicles.map((vehicle) => (
              <option key={vehicle.id} value={vehicle.id}>
                {vehicle.registration_number} - {vehicle.make} {vehicle.model}
              </option>
            ))}
          </select>
        </div>

        {/* Service Type Filter */}
        <div className={styles.filterGroup}>
          <label htmlFor="type-filter">Service Type</label>
          <select
            id="type-filter"
            value={currentServiceType || ''}
            onChange={(e) => updateFilter('service_type', e.target.value)}
            className={styles.select}
          >
            <option value="">All Types</option>
            {Object.entries(serviceTypes).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </div>

        {/* Sort Options */}
        <div className={styles.filterGroup}>
          <label htmlFor="sort-filter">Sort By</label>
          <select
            id="sort-filter"
            value={currentSort || ''}
            onChange={(e) => updateFilter('sort', e.target.value)}
            className={styles.select}
          >
            <option value="">Date (Latest First)</option>
            <option value="mileage">Mileage (Highest First)</option>
          </select>
        </div>
      </div>

      {/* Clear Filters */}
      {hasFilters && (
        <button onClick={clearFilters} className={styles.clearBtn}>
          Clear Filters
        </button>
      )}
    </div>
  );
}
