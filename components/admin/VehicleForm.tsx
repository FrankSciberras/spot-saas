'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import type { VehicleStatus } from '@/lib/types/database';
import styles from './AdminForms.module.css';

interface PartialDriver {
  id: string;
  full_name: string;
  phone?: string | null;
  assigned_vehicle_id?: string | null;
}

interface FileRecord {
  id: string;
  type: string;
  file_url: string;
  file_name: string | null;
  uploaded_at: string;
}

interface PartialVehicle {
  id?: string;
  registration_number?: string;
  make?: string;
  model?: string;
  year?: number | null;
  mileage?: number;
  color?: string | null;
  status?: VehicleStatus;
  assigned_driver_id?: string | null;
  insurance_expiry_date?: string | null;
  road_license_expiry_date?: string | null;
  notes?: string | null;
}

interface VehicleFormProps {
  vehicle?: PartialVehicle;
  drivers: PartialDriver[];
  documents?: FileRecord[];
  mode: 'create' | 'edit';
}

export default function VehicleForm({ vehicle, drivers, documents = [], mode }: VehicleFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadingType, setUploadingType] = useState<string | null>(null);
  const [uploadedFiles, setUploadedFiles] = useState<Record<string, FileRecord[]>>(() => {
    const grouped: Record<string, FileRecord[]> = {};
    documents.forEach(doc => {
      if (!grouped[doc.type]) grouped[doc.type] = [];
      grouped[doc.type].push(doc);
    });
    return grouped;
  });

  const fileInputRefs = {
    VEHICLE_INSURANCE: useRef<HTMLInputElement>(null),
    ROAD_LICENSE: useRef<HTMLInputElement>(null),
    LOGBOOK: useRef<HTMLInputElement>(null),
    OTHER: useRef<HTMLInputElement>(null),
  };

  const [formData, setFormData] = useState({
    registration_number: vehicle?.registration_number || '',
    make: vehicle?.make || '',
    model: vehicle?.model || '',
    year: vehicle?.year?.toString() || '',
    mileage: vehicle?.mileage?.toString() || '0',
    color: vehicle?.color || '',
    status: vehicle?.status || 'active' as VehicleStatus,
    assigned_driver_id: vehicle?.assigned_driver_id || '',
    insurance_expiry_date: vehicle?.insurance_expiry_date || '',
    road_license_expiry_date: vehicle?.road_license_expiry_date || '',
    notes: vehicle?.notes || '',
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleFileUpload = async (docType: string, file: File) => {
    if (!vehicle?.id) {
      setError('Please save the vehicle first before uploading documents');
      return;
    }

    setUploadingType(docType);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('owner_type', 'vehicle');
      formData.append('owner_id', vehicle.id);
      formData.append('type', docType);

      const res = await fetch('/api/files/upload', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Upload failed');
      }

      const { data: newFile } = await res.json();
      setUploadedFiles(prev => ({
        ...prev,
        [docType]: [...(prev[docType] || []), newFile],
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploadingType(null);
    }
  };

  const handleFileInputChange = (docType: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileUpload(docType, file);
    }
    e.target.value = '';
  };

  const triggerFileInput = (docType: keyof typeof fileInputRefs) => {
    fileInputRefs[docType].current?.click();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const url = mode === 'create' ? '/api/vehicles' : `/api/vehicles/${vehicle?.id}`;
      const method = mode === 'create' ? 'POST' : 'PUT';

      const payload = {
        ...formData,
        year: formData.year ? parseInt(formData.year) : null,
        mileage: parseInt(formData.mileage) || 0,
        assigned_driver_id: formData.assigned_driver_id || null,
        insurance_expiry_date: formData.insurance_expiry_date || null,
        road_license_expiry_date: formData.road_license_expiry_date || null,
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

      router.push('/admin/vehicles');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  // Filter available drivers (not assigned or assigned to this vehicle)
  const availableDrivers = drivers.filter(
    d => !d.assigned_vehicle_id || (vehicle?.assigned_driver_id && d.id === vehicle.assigned_driver_id)
  );

  // Common car makes for quick selection
  const commonMakes = [
    'Toyota', 'Volkswagen', 'Mercedes-Benz', 'BMW', 'Audi', 
    'Ford', 'Hyundai', 'Kia', 'Nissan', 'Peugeot', 'Renault',
    'Skoda', 'Seat', 'Fiat', 'Opel', 'Honda', 'Mazda'
  ].sort();

  return (
    <form onSubmit={handleSubmit} className={styles.form}>
      {error && (
        <div className="alert alert-danger">
          {error}
        </div>
      )}

      {/* Vehicle Information Section */}
      <div className={styles.formSection}>
        <h3>Vehicle Information</h3>
        <div className={styles.formGrid}>
          <div className={styles.formGroup}>
            <label htmlFor="registration_number">Registration Number *</label>
            <input
              type="text"
              id="registration_number"
              name="registration_number"
              value={formData.registration_number}
              onChange={handleChange}
              required
              placeholder="e.g., ABC 123"
              style={{ textTransform: 'uppercase' }}
            />
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="make">Make *</label>
            <input
              type="text"
              id="make"
              name="make"
              value={formData.make}
              onChange={handleChange}
              required
              list="makes-list"
              placeholder="e.g., Toyota"
            />
            <datalist id="makes-list">
              {commonMakes.map(make => (
                <option key={make} value={make} />
              ))}
            </datalist>
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="model">Model *</label>
            <input
              type="text"
              id="model"
              name="model"
              value={formData.model}
              onChange={handleChange}
              required
              placeholder="e.g., Corolla"
            />
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="year">Year</label>
            <input
              type="number"
              id="year"
              name="year"
              value={formData.year}
              onChange={handleChange}
              min="1990"
              max={new Date().getFullYear() + 1}
              placeholder="e.g., 2023"
            />
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="color">Color</label>
            <input
              type="text"
              id="color"
              name="color"
              value={formData.color}
              onChange={handleChange}
              placeholder="e.g., White"
            />
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="mileage">Current Mileage (km)</label>
            <input
              type="number"
              id="mileage"
              name="mileage"
              value={formData.mileage}
              onChange={handleChange}
              min="0"
              placeholder="0"
            />
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="status">Status</label>
            <select
              id="status"
              name="status"
              value={formData.status}
              onChange={handleChange}
            >
              <option value="active">Active</option>
              <option value="in_service">In Service</option>
              <option value="out_of_service">Out of Service</option>
            </select>
          </div>
        </div>
      </div>

      {/* Documents & Expiry Section */}
      <div className={styles.formSection}>
        <h3>Documents &amp; Expiry Dates</h3>
        
        {/* Insurance */}
        <div className={styles.documentRow}>
          <div className={styles.documentInfo}>
            <span className={styles.documentLabel}>🛡️ Vehicle Insurance</span>
            <div className={styles.formGroup}>
              <label htmlFor="insurance_expiry_date">Expiry Date</label>
              <input
                type="date"
                id="insurance_expiry_date"
                name="insurance_expiry_date"
                value={formData.insurance_expiry_date}
                onChange={handleChange}
              />
            </div>
          </div>
          <div className={styles.documentUpload}>
            <input
              type="file"
              ref={fileInputRefs.VEHICLE_INSURANCE}
              onChange={handleFileInputChange('VEHICLE_INSURANCE')}
              accept=".pdf,.jpg,.jpeg,.png"
              style={{ display: 'none' }}
            />
            {mode === 'edit' && (
              <button
                type="button"
                className={`btn btn-secondary ${styles.uploadBtn}`}
                onClick={() => triggerFileInput('VEHICLE_INSURANCE')}
                disabled={uploadingType === 'VEHICLE_INSURANCE'}
              >
                {uploadingType === 'VEHICLE_INSURANCE' ? 'Uploading...' : '📎 Upload'}
              </button>
            )}
            {uploadedFiles.VEHICLE_INSURANCE?.map(file => (
              <a
                key={file.id}
                href={file.file_url}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.uploadedFile}
              >
                📄 {file.file_name || 'Insurance Document'}
              </a>
            ))}
          </div>
        </div>

        {/* Road License */}
        <div className={styles.documentRow}>
          <div className={styles.documentInfo}>
            <span className={styles.documentLabel}>📋 Road License</span>
            <div className={styles.formGroup}>
              <label htmlFor="road_license_expiry_date">Expiry Date</label>
              <input
                type="date"
                id="road_license_expiry_date"
                name="road_license_expiry_date"
                value={formData.road_license_expiry_date}
                onChange={handleChange}
              />
            </div>
          </div>
          <div className={styles.documentUpload}>
            <input
              type="file"
              ref={fileInputRefs.ROAD_LICENSE}
              onChange={handleFileInputChange('ROAD_LICENSE')}
              accept=".pdf,.jpg,.jpeg,.png"
              style={{ display: 'none' }}
            />
            {mode === 'edit' && (
              <button
                type="button"
                className={`btn btn-secondary ${styles.uploadBtn}`}
                onClick={() => triggerFileInput('ROAD_LICENSE')}
                disabled={uploadingType === 'ROAD_LICENSE'}
              >
                {uploadingType === 'ROAD_LICENSE' ? 'Uploading...' : '📎 Upload'}
              </button>
            )}
            {uploadedFiles.ROAD_LICENSE?.map(file => (
              <a
                key={file.id}
                href={file.file_url}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.uploadedFile}
              >
                📄 {file.file_name || 'Road License'}
              </a>
            ))}
          </div>
        </div>

        {/* Logbook */}
        <div className={styles.documentRow}>
          <div className={styles.documentInfo}>
            <span className={styles.documentLabel}>📖 Logbook</span>
            <p className={styles.documentHint}>Vehicle registration logbook</p>
          </div>
          <div className={styles.documentUpload}>
            <input
              type="file"
              ref={fileInputRefs.LOGBOOK}
              onChange={handleFileInputChange('LOGBOOK')}
              accept=".pdf,.jpg,.jpeg,.png"
              style={{ display: 'none' }}
            />
            {mode === 'edit' && (
              <button
                type="button"
                className={`btn btn-secondary ${styles.uploadBtn}`}
                onClick={() => triggerFileInput('LOGBOOK')}
                disabled={uploadingType === 'LOGBOOK'}
              >
                {uploadingType === 'LOGBOOK' ? 'Uploading...' : '📎 Upload'}
              </button>
            )}
            {uploadedFiles.LOGBOOK?.map(file => (
              <a
                key={file.id}
                href={file.file_url}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.uploadedFile}
              >
                📄 {file.file_name || 'Logbook'}
              </a>
            ))}
          </div>
        </div>

        {/* Other Documents */}
        <div className={styles.documentRow}>
          <div className={styles.documentInfo}>
            <span className={styles.documentLabel}>📁 Other Documents</span>
            <p className={styles.documentHint}>Upload any other vehicle-related documents</p>
          </div>
          <div className={styles.documentUpload}>
            <input
              type="file"
              ref={fileInputRefs.OTHER}
              onChange={handleFileInputChange('OTHER')}
              accept=".pdf,.jpg,.jpeg,.png"
              style={{ display: 'none' }}
            />
            {mode === 'edit' && (
              <button
                type="button"
                className={`btn btn-secondary ${styles.uploadBtn}`}
                onClick={() => triggerFileInput('OTHER')}
                disabled={uploadingType === 'OTHER'}
              >
                {uploadingType === 'OTHER' ? 'Uploading...' : '📎 Upload'}
              </button>
            )}
            {uploadedFiles.OTHER?.map(file => (
              <a
                key={file.id}
                href={file.file_url}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.uploadedFile}
              >
                📄 {file.file_name || 'Document'}
              </a>
            ))}
          </div>
        </div>

        {mode === 'create' && (
          <p className={styles.uploadNote}>
            💡 Save the vehicle first, then you can upload documents.
          </p>
        )}
      </div>

      {/* Driver Assignment Section */}
      <div className={styles.formSection}>
        <h3>Driver Assignment</h3>
        <div className={styles.formGrid}>
          <div className={styles.formGroup}>
            <label htmlFor="assigned_driver_id">Assigned Driver</label>
            <select
              id="assigned_driver_id"
              name="assigned_driver_id"
              value={formData.assigned_driver_id}
              onChange={handleChange}
            >
              <option value="">No driver assigned</option>
              {availableDrivers.map(driver => (
                <option key={driver.id} value={driver.id}>
                  {driver.full_name} {driver.phone ? `(${driver.phone})` : ''}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Notes Section */}
      <div className={styles.formSection}>
        <h3>Additional Notes</h3>
        <div className={styles.formGroup}>
          <label htmlFor="notes">Notes</label>
          <textarea
            id="notes"
            name="notes"
            value={formData.notes}
            onChange={handleChange}
            rows={4}
            placeholder="Any additional notes about this vehicle..."
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
          {loading ? 'Saving...' : mode === 'create' ? 'Create Vehicle' : 'Save Changes'}
        </button>
      </div>
    </form>
  );
}
