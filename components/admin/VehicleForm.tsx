'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import DatePicker from '@/components/shared/DatePicker';
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
  assigned_driver_ids?: string[];
  insurance_expiry_date?: string | null;
  road_license_expiry_date?: string | null;
  notes?: string | null;
  vehicle_model_id?: string | null;
}

interface VehicleModelOption {
  id: string;
  name: string;
  model_key: string;
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
  const [deletingFileId, setDeletingFileId] = useState<string | null>(null);
  const [driverToAddId, setDriverToAddId] = useState('');
  const [assignedDriverIds, setAssignedDriverIds] = useState<string[]>(() => {
    return vehicle?.assigned_driver_ids || (vehicle?.assigned_driver_id ? [vehicle.assigned_driver_id] : []);
  });
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
    vehicle_model_id: vehicle?.vehicle_model_id || '',
  });

  // Car-model diagram presets (managed by the platform admin) for the dropdown.
  const [vehicleModels, setVehicleModels] = useState<VehicleModelOption[]>([]);
  useEffect(() => {
    let active = true;
    fetch('/api/vehicle-models')
      .then((r) => (r.ok ? r.json() : { data: [] }))
      .then((json) => { if (active) setVehicleModels(json.data || []); })
      .catch(() => { /* non-fatal: dropdown just stays empty */ });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const loadAssignments = async () => {
      if (mode !== 'edit' || !vehicle?.id) return;
      try {
        const res = await fetch(`/api/vehicles/${vehicle.id}`, { method: 'GET' });
        if (!res.ok) return;
        const data = (await res.json()) as { data?: { assigned_driver_ids?: string[] } };
        const ids = data.data?.assigned_driver_ids;
        if (ids) {
          setAssignedDriverIds(ids);
          setFormData((prev) => ({
            ...prev,
            assigned_driver_id: ids[0] || '',
          }));
        }
      } catch {
      }
    };
    loadAssignments();
  }, [mode, vehicle?.id]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const addAssignedDriver = () => {
    if (!driverToAddId) return;
    setAssignedDriverIds((prev) => {
      if (prev.includes(driverToAddId)) return prev;
      const next = [...prev, driverToAddId];
      setFormData((fd) => ({
        ...fd,
        assigned_driver_id: next[0] || '',
      }));
      return next;
    });
    setDriverToAddId('');
  };

  const removeAssignedDriver = (driverId: string) => {
    setAssignedDriverIds((prev) => {
      const next = prev.filter((id) => id !== driverId);
      setFormData((fd) => ({
        ...fd,
        assigned_driver_id: next[0] || '',
      }));
      return next;
    });
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

  const handleFileDelete = async (docType: string, fileId: string) => {
    const confirmed = window.confirm('Remove this file?');
    if (!confirmed) return;

    setDeletingFileId(fileId);
    setError(null);
    try {
      const res = await fetch(`/api/files/${fileId}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to delete file');
      }

      setUploadedFiles((prev) => {
        const list = prev[docType] || [];
        return {
          ...prev,
          [docType]: list.filter((f) => f.id !== fileId),
        };
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete file');
    } finally {
      setDeletingFileId(null);
    }
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
        assigned_driver_id: assignedDriverIds[0] || formData.assigned_driver_id || null,
        assigned_driver_ids: assignedDriverIds,
        insurance_expiry_date: formData.insurance_expiry_date || null,
        road_license_expiry_date: formData.road_license_expiry_date || null,
        vehicle_model_id: formData.vehicle_model_id || null,
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

      router.push('/fleet/vehicles');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const availableDrivers = drivers;

  const driverLabelById = new Map(
    availableDrivers.map((d) => [d.id, `${d.full_name}${d.phone ? ` (${d.phone})` : ''}`] as const)
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
            <label htmlFor="vehicle_model_id">Car model / diagram</label>
            <select
              id="vehicle_model_id"
              name="vehicle_model_id"
              value={formData.vehicle_model_id}
              onChange={handleChange}
            >
              <option value="">— No diagram —</option>
              {vehicleModels.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
            <small className={styles.hint}>Pick the car model to show its damage diagram. Models are managed by your provider.</small>
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
              <DatePicker
                value={formData.insurance_expiry_date}
                onChange={(date) => setFormData(prev => ({ ...prev, insurance_expiry_date: date }))}
                placeholder="Select expiry date"
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
                className={styles.uploadBtnWide}
                onClick={() => triggerFileInput('VEHICLE_INSURANCE')}
                disabled={uploadingType === 'VEHICLE_INSURANCE'}
              >
                {uploadingType === 'VEHICLE_INSURANCE' ? 'Uploading...' : 'Upload'}
              </button>
            )}
            {uploadedFiles.VEHICLE_INSURANCE?.map(file => (
              <span key={file.id} className={styles.uploadedFileRow}>
                <a
                  href={`/api/files/${file.id}/view`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.uploadedFile}
                >
                  📄 {file.file_name || 'Insurance Document'}
                </a>
                {mode === 'edit' && (
                  <button
                    type="button"
                    className={styles.fileRemoveBtn}
                    onClick={() => handleFileDelete('VEHICLE_INSURANCE', file.id)}
                    disabled={deletingFileId === file.id}
                    title="Remove file"
                  >
                    {deletingFileId === file.id ? '…' : '×'}
                  </button>
                )}
              </span>
            ))}
          </div>
        </div>

        {/* Road License */}
        <div className={styles.documentRow}>
          <div className={styles.documentInfo}>
            <span className={styles.documentLabel}>📋 Road License</span>
            <div className={styles.formGroup}>
              <label htmlFor="road_license_expiry_date">Expiry Date</label>
              <DatePicker
                value={formData.road_license_expiry_date}
                onChange={(date) => setFormData(prev => ({ ...prev, road_license_expiry_date: date }))}
                placeholder="Select expiry date"
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
                className={styles.uploadBtnWide}
                onClick={() => triggerFileInput('ROAD_LICENSE')}
                disabled={uploadingType === 'ROAD_LICENSE'}
              >
                {uploadingType === 'ROAD_LICENSE' ? 'Uploading...' : 'Upload'}
              </button>
            )}
            {uploadedFiles.ROAD_LICENSE?.map(file => (
              <span key={file.id} className={styles.uploadedFileRow}>
                <a
                  href={`/api/files/${file.id}/view`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.uploadedFile}
                >
                  📄 {file.file_name || 'Road License'}
                </a>
                {mode === 'edit' && (
                  <button
                    type="button"
                    className={styles.fileRemoveBtn}
                    onClick={() => handleFileDelete('ROAD_LICENSE', file.id)}
                    disabled={deletingFileId === file.id}
                    title="Remove file"
                  >
                    {deletingFileId === file.id ? '…' : '×'}
                  </button>
                )}
              </span>
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
                className={styles.uploadBtnWide}
                onClick={() => triggerFileInput('LOGBOOK')}
                disabled={uploadingType === 'LOGBOOK'}
              >
                {uploadingType === 'LOGBOOK' ? 'Uploading...' : 'Upload'}
              </button>
            )}
            {uploadedFiles.LOGBOOK?.map(file => (
              <span key={file.id} className={styles.uploadedFileRow}>
                <a
                  href={`/api/files/${file.id}/view`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.uploadedFile}
                >
                  📄 {file.file_name || 'Logbook'}
                </a>
                {mode === 'edit' && (
                  <button
                    type="button"
                    className={styles.fileRemoveBtn}
                    onClick={() => handleFileDelete('LOGBOOK', file.id)}
                    disabled={deletingFileId === file.id}
                    title="Remove file"
                  >
                    {deletingFileId === file.id ? '…' : '×'}
                  </button>
                )}
              </span>
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
                className={styles.uploadBtnWide}
                onClick={() => triggerFileInput('OTHER')}
                disabled={uploadingType === 'OTHER'}
              >
                {uploadingType === 'OTHER' ? 'Uploading...' : 'Upload'}
              </button>
            )}
            {uploadedFiles.OTHER?.map(file => (
              <span key={file.id} className={styles.uploadedFileRow}>
                <a
                  href={`/api/files/${file.id}/view`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.uploadedFile}
                >
                  📄 {file.file_name || 'Document'}
                </a>
                {mode === 'edit' && (
                  <button
                    type="button"
                    className={styles.fileRemoveBtn}
                    onClick={() => handleFileDelete('OTHER', file.id)}
                    disabled={deletingFileId === file.id}
                    title="Remove file"
                  >
                    {deletingFileId === file.id ? '…' : '×'}
                  </button>
                )}
              </span>
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
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <select
                id="assigned_driver_id"
                name="assigned_driver_id"
                value={driverToAddId}
                onChange={(e) => setDriverToAddId(e.target.value)}
              >
                <option value="">Select driver</option>
                {availableDrivers.map((driver) => (
                  <option key={driver.id} value={driver.id}>
                    {driver.full_name} {driver.phone ? `(${driver.phone})` : ''}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={addAssignedDriver}
                disabled={!driverToAddId}
                title="Add"
              >
                +
              </button>
            </div>

            {assignedDriverIds.length > 0 && (
              <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {assignedDriverIds.map((id) => (
                  <div key={id} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <div style={{ flex: 1 }}>{driverLabelById.get(id) || id}</div>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => removeAssignedDriver(id)}
                      title="Remove"
                    >
                      -
                    </button>
                  </div>
                ))}
              </div>
            )}
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
