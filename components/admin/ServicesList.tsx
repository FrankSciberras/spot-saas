'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import styles from './ServicesList.module.css';

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

interface ServicesListProps {
  services: VehicleService[];
  serviceTypeLabels: Record<string, string>;
}

export default function ServicesList({ services, serviceTypeLabels }: ServicesListProps) {
  const router = useRouter();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  };

  const toggleSelect = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === services.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(services.map(s => s.id)));
    }
  };

  const handleDelete = async () => {
    if (selectedIds.size === 0) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/services/bulk', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(selectedIds) }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to delete services');
      }

      setSelectedIds(new Set());
      setShowConfirm(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const allSelected = services.length > 0 && selectedIds.size === services.length;
  const someSelected = selectedIds.size > 0;

  return (
    <div className={styles.wrapper}>
      {/* Bulk Actions Bar */}
      {someSelected && (
        <div className={styles.bulkActions}>
          <span className={styles.selectedCount}>
            {selectedIds.size} service{selectedIds.size !== 1 ? 's' : ''} selected
          </span>
          <button
            type="button"
            className={styles.deleteBtn}
            onClick={() => setShowConfirm(true)}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
            </svg>
            Delete Selected
          </button>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showConfirm && (
        <div className={styles.modalOverlay} onClick={() => !loading && setShowConfirm(false)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <h3>Confirm Deletion</h3>
            <p>
              Are you sure you want to delete <strong>{selectedIds.size}</strong> service record{selectedIds.size !== 1 ? 's' : ''}? 
              This action cannot be undone.
            </p>
            {error && (
              <div className={styles.error}>{error}</div>
            )}
            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.cancelBtn}
                onClick={() => setShowConfirm(false)}
                disabled={loading}
              >
                Cancel
              </button>
              <button
                type="button"
                className={styles.confirmDeleteBtn}
                onClick={handleDelete}
                disabled={loading}
              >
                {loading ? 'Deleting...' : 'Yes, Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Services Table */}
      <div className={styles.servicesTable}>
        <table>
          <thead>
            <tr>
              <th className={styles.checkboxCol}>
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleSelectAll}
                  title="Select all"
                />
              </th>
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
            {services.map((service) => (
              <tr 
                key={service.id} 
                className={selectedIds.has(service.id) ? styles.selected : ''}
              >
                <td className={styles.checkboxCol}>
                  <input
                    type="checkbox"
                    checked={selectedIds.has(service.id)}
                    onChange={() => toggleSelect(service.id)}
                  />
                </td>
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
                    {serviceTypeLabels[service.service_type] || service.service_type}
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
    </div>
  );
}
