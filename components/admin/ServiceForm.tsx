'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import DatePicker from '@/components/shared/DatePicker';
import styles from './AdminForms.module.css';

interface Vehicle {
  id: string;
  registration_number: string;
  make: string;
  model: string;
  mileage: number;
}

interface ServiceRecord {
  id?: string;
  vehicle_id: string;
  service_date: string;
  service_type: string;
  mileage_at_service: number;
  next_service_mileage?: number | null;
  next_service_date?: string | null;
  cost?: number | null;
  currency?: string;
  service_provider?: string | null;
  description?: string | null;
  parts_replaced?: string | null;
  invoice_url?: string | null;
}

interface ServiceFormProps {
  service?: ServiceRecord;
  vehicles: Vehicle[];
  mode: 'create' | 'edit';
}

const SERVICE_TYPES = [
  { value: 'oil_change', label: 'Oil Change' },
  { value: 'tire_rotation', label: 'Tire Rotation' },
  { value: 'tire_replacement', label: 'Tire Replacement' },
  { value: 'brake_service', label: 'Brake Service' },
  { value: 'brake_pads', label: 'Brake Pads' },
  { value: 'brake_discs', label: 'Brake Discs' },
  { value: 'air_filter', label: 'Air Filter' },
  { value: 'cabin_filter', label: 'Cabin Filter' },
  { value: 'spark_plugs', label: 'Spark Plugs' },
  { value: 'battery', label: 'Battery' },
  { value: 'transmission', label: 'Transmission Service' },
  { value: 'coolant_flush', label: 'Coolant Flush' },
  { value: 'timing_belt', label: 'Timing Belt' },
  { value: 'general_inspection', label: 'General Inspection' },
  { value: 'annual_service', label: 'Annual Service' },
  { value: 'major_service', label: 'Major Service' },
  { value: 'repair', label: 'Repair' },
  { value: 'other', label: 'Other' },
];

export default function ServiceForm({ service, vehicles, mode }: ServiceFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const today = new Date().toISOString().split('T')[0];

  const [formData, setFormData] = useState({
    vehicle_id: service?.vehicle_id || '',
    service_date: service?.service_date || today,
    service_type: service?.service_type || 'other',
    mileage_at_service: service?.mileage_at_service || '',
    next_service_mileage: service?.next_service_mileage || '',
    next_service_date: service?.next_service_date || '',
    cost: service?.cost || '',
    currency: service?.currency || 'EUR',
    service_provider: service?.service_provider || '',
    description: service?.description || '',
    parts_replaced: service?.parts_replaced || '',
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleVehicleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const vehicleId = e.target.value;
    const vehicle = vehicles.find(v => v.id === vehicleId);
    setFormData(prev => ({
      ...prev,
      vehicle_id: vehicleId,
      mileage_at_service: vehicle ? vehicle.mileage.toString() : '',
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const url = mode === 'create' ? '/api/services' : `/api/services/${service?.id}`;
      const method = mode === 'create' ? 'POST' : 'PUT';

      const payload = {
        ...formData,
        mileage_at_service: parseInt(formData.mileage_at_service.toString()) || 0,
        next_service_mileage: formData.next_service_mileage ? parseInt(formData.next_service_mileage.toString()) : null,
        next_service_date: formData.next_service_date || null,
        cost: formData.cost ? parseFloat(formData.cost.toString()) : null,
      };

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Something went wrong');
      }

      router.push('/admin/services');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className={styles.form}>
      {error && (
        <div className="alert alert-danger">
          {error}
        </div>
      )}

      {/* Service Details */}
      <div className={styles.formSection}>
        <h3>Service Details</h3>
        <div className={styles.formGrid}>
          <div className={styles.formGroup}>
            <label htmlFor="vehicle_id">Vehicle *</label>
            <select
              id="vehicle_id"
              name="vehicle_id"
              value={formData.vehicle_id}
              onChange={handleVehicleChange}
              required
            >
              <option value="">Select a vehicle</option>
              {vehicles.map(vehicle => (
                <option key={vehicle.id} value={vehicle.id}>
                  {vehicle.registration_number} - {vehicle.make} {vehicle.model}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="service_date">Service Date *</label>
            <DatePicker
              value={formData.service_date}
              onChange={(date) => setFormData(prev => ({ ...prev, service_date: date }))}
              placeholder="Select service date"
            />
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="service_type">Service Type *</label>
            <select
              id="service_type"
              name="service_type"
              value={formData.service_type}
              onChange={handleChange}
              required
            >
              {SERVICE_TYPES.map(type => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="mileage_at_service">Mileage at Service (km) *</label>
            <input
              type="number"
              id="mileage_at_service"
              name="mileage_at_service"
              value={formData.mileage_at_service}
              onChange={handleChange}
              required
              min="0"
              placeholder="Current mileage"
            />
          </div>
        </div>
      </div>

      {/* Next Service */}
      <div className={styles.formSection}>
        <h3>Next Service Due</h3>
        <div className={styles.formGrid}>
          <div className={styles.formGroup}>
            <label htmlFor="next_service_mileage">Next Service Mileage (km)</label>
            <input
              type="number"
              id="next_service_mileage"
              name="next_service_mileage"
              value={formData.next_service_mileage}
              onChange={handleChange}
              min="0"
              placeholder="e.g., 50000"
            />
            <span className={styles.helpText}>Leave empty if not applicable</span>
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="next_service_date">Next Service Date</label>
            <DatePicker
              value={formData.next_service_date}
              onChange={(date) => setFormData(prev => ({ ...prev, next_service_date: date }))}
              placeholder="Select date"
            />
            <span className={styles.helpText}>For time-based services</span>
          </div>
        </div>
      </div>

      {/* Cost & Provider */}
      <div className={styles.formSection}>
        <h3>Cost &amp; Provider</h3>
        <div className={styles.formGrid}>
          <div className={styles.formGroup}>
            <label htmlFor="cost">Cost</label>
            <div className={styles.inputGroup}>
              <select
                name="currency"
                value={formData.currency}
                onChange={handleChange}
                className={styles.currencySelect}
              >
                <option value="EUR">EUR</option>
                <option value="USD">USD</option>
                <option value="GBP">GBP</option>
              </select>
              <input
                type="number"
                id="cost"
                name="cost"
                value={formData.cost}
                onChange={handleChange}
                min="0"
                step="0.01"
                placeholder="0.00"
              />
            </div>
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="service_provider">Service Provider</label>
            <input
              type="text"
              id="service_provider"
              name="service_provider"
              value={formData.service_provider}
              onChange={handleChange}
              placeholder="Garage or mechanic name"
            />
          </div>
        </div>
      </div>

      {/* Additional Details */}
      <div className={styles.formSection}>
        <h3>Additional Details</h3>
        <div className={styles.formGroup}>
          <label htmlFor="description">Description</label>
          <textarea
            id="description"
            name="description"
            value={formData.description}
            onChange={handleChange}
            rows={3}
            placeholder="What was done during the service..."
          />
        </div>

        <div className={styles.formGroup}>
          <label htmlFor="parts_replaced">Parts Replaced</label>
          <textarea
            id="parts_replaced"
            name="parts_replaced"
            value={formData.parts_replaced}
            onChange={handleChange}
            rows={2}
            placeholder="List of parts replaced..."
          />
        </div>
      </div>

      {/* Form Actions */}
      <div className={styles.formActions}>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => router.back()}
          disabled={loading}
        >
          Cancel
        </button>
        <button
          type="submit"
          className="btn btn-primary"
          disabled={loading}
        >
          {loading ? 'Saving...' : mode === 'create' ? 'Add Service' : 'Save Changes'}
        </button>
      </div>
    </form>
  );
}
