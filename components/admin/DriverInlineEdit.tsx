'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import InlineEditField from './InlineEditField';
import styles from './AdminForms.module.css';
import inlineStyles from './InlineEdit.module.css';

interface PartialVehicle {
  id: string;
  registration_number: string;
  make: string;
  model: string;
  assigned_driver_id?: string | null;
}

interface FileRecord {
  id: string;
  type: string;
  file_url: string;
  file_name: string | null;
  uploaded_at: string;
}

interface DriverData {
  id: string;
  user_id: string;
  full_name: string;
  phone: string | null;
  address: string | null;
  status: 'active' | 'inactive';
  employment_type: 'full_time' | 'part_time' | 'terminated' | null;
  assigned_vehicle_id: string | null;
  assigned_vehicle_ids?: string[];
  id_card_number: string | null;
  id_card_expiry_date: string | null;
  police_conduct_expiry_date: string | null;
  driving_license_number: string | null;
  driving_license_expiry_date: string | null;
  tag_license_expiry_date: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  users?: { email: string } | null;
  vehicles?: { id: string; registration_number: string; make: string; model: string } | null;
  assigned_vehicles?: { id: string; registration_number: string; make: string; model: string }[];
}

interface DriverInlineEditProps {
  driver: DriverData;
  vehicles: PartialVehicle[];
  documents: FileRecord[];
  recentShifts: Array<{
    id: string;
    start_time: string;
    end_time: string | null;
    starting_mileage: number;
  }>;
}

export default function DriverInlineEdit({ 
  driver: initialDriver, 
  vehicles, 
  documents: initialDocuments,
  recentShifts 
}: DriverInlineEditProps) {
  const router = useRouter();
  const [driver, setDriver] = useState(initialDriver);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [uploadingType, setUploadingType] = useState<string | null>(null);
  const [vehicleToAddId, setVehicleToAddId] = useState('');
  const [assignedVehicleIds, setAssignedVehicleIds] = useState<string[]>(() => {
    return initialDriver.assigned_vehicle_ids || (initialDriver.assigned_vehicle_id ? [initialDriver.assigned_vehicle_id] : []);
  });
  const [savingAssignments, setSavingAssignments] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<Record<string, FileRecord[]>>(() => {
    const grouped: Record<string, FileRecord[]> = {};
    initialDocuments.forEach(doc => {
      if (!grouped[doc.type]) grouped[doc.type] = [];
      grouped[doc.type].push(doc);
    });
    return grouped;
  });

  const fileInputRefs = {
    ID_CARD: useRef<HTMLInputElement>(null),
    DRIVING_LICENSE: useRef<HTMLInputElement>(null),
    POLICE_CONDUCT: useRef<HTMLInputElement>(null),
    TAG_LICENSE: useRef<HTMLInputElement>(null),
  };

  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 3000);
  };

  useEffect(() => {
    const loadAssignments = async () => {
      try {
        const res = await fetch(`/api/drivers/${initialDriver.id}`, { method: 'GET' });
        if (!res.ok) return;
        const data = (await res.json()) as { data?: { assigned_vehicle_ids?: string[]; assigned_vehicles?: DriverData['assigned_vehicles'] } };
        const ids = data.data?.assigned_vehicle_ids;
        if (ids) {
          setAssignedVehicleIds(ids);
          setDriver((prev) => ({
            ...prev,
            assigned_vehicle_ids: ids,
            assigned_vehicles: data.data?.assigned_vehicles,
          }));
        }
      } catch {
      }
    };
    loadAssignments();
  }, [initialDriver.id]);

  const handleSave = async (fieldName: string, value: string): Promise<boolean> => {
    try {
      const res = await fetch(`/api/drivers/${driver.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [fieldName]: value || null }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to save');
      }

      await res.json();
      setDriver(prev => ({ ...prev, [fieldName]: value || null }));
      showMessage('success', 'Saved');
      router.refresh();
      return true;
    } catch (err) {
      showMessage('error', err instanceof Error ? err.message : 'Failed to save');
      return false;
    }
  };

  const addAssignedVehicle = () => {
    if (!vehicleToAddId) return;
    setAssignedVehicleIds((prev) => {
      if (prev.includes(vehicleToAddId)) return prev;
      return [...prev, vehicleToAddId];
    });
    setVehicleToAddId('');
  };

  const removeAssignedVehicle = (vehicleId: string) => {
    setAssignedVehicleIds((prev) => prev.filter((id) => id !== vehicleId));
  };

  const saveAssignedVehicles = async () => {
    setSavingAssignments(true);
    try {
      const res = await fetch(`/api/drivers/${driver.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assigned_vehicle_ids: assignedVehicleIds }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to save');
      }

      setDriver((prev) => ({
        ...prev,
        assigned_vehicle_id: assignedVehicleIds[0] || null,
        assigned_vehicle_ids: assignedVehicleIds,
      }));
      showMessage('success', 'Saved');
      router.refresh();
    } catch (err) {
      showMessage('error', err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSavingAssignments(false);
    }
  };

  const handleFileUpload = async (docType: string, file: File) => {
    setUploadingType(docType);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('owner_type', 'driver');
      formData.append('owner_id', driver.id);
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
      showMessage('success', 'File uploaded');
    } catch (err) {
      showMessage('error', err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploadingType(null);
    }
  };

  const triggerFileInput = (docType: keyof typeof fileInputRefs) => {
    fileInputRefs[docType].current?.click();
  };

  const formatDate = (dateStr: string | null): string => {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  };

  const getExpiryClass = (dateStr: string | null): string => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const now = new Date();
    const thirtyDays = new Date();
    thirtyDays.setDate(now.getDate() + 30);
    
    if (date < now) return 'expiry-danger';
    if (date <= thirtyDays) return 'expiry-warning';
    return 'expiry-ok';
  };

  const getExpiryLabel = (dateStr: string | null): string => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const now = new Date();
    
    if (date < now) return ' (Expired)';
    
    const thirtyDays = new Date();
    thirtyDays.setDate(now.getDate() + 30);
    if (date <= thirtyDays) return ' (Expiring soon)';
    
    return '';
  };

  const availableVehicles = vehicles;

  const vehicleLabelById = new Map(
    availableVehicles.map((v) => [v.id, `${v.registration_number} - ${v.make} ${v.model}`] as const)
  );

  const vehicleOptions = [
    { value: '', label: 'No vehicle assigned' },
    ...availableVehicles.map(v => ({
      value: v.id,
      label: `${v.registration_number} - ${v.make} ${v.model}`
    }))
  ];

  const renderUploadButton = (docType: keyof typeof fileInputRefs) => (
    <>
      <input
        type="file"
        ref={fileInputRefs[docType]}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFileUpload(docType, file);
          e.target.value = '';
        }}
        accept=".pdf,.jpg,.jpeg,.png"
        style={{ display: 'none' }}
      />
      <button
        type="button"
        className={inlineStyles.uploadBtn}
        onClick={() => triggerFileInput(docType)}
        disabled={uploadingType === docType}
        title="Upload document"
      >
        {uploadingType === docType ? '...' : '📎'}
      </button>
    </>
  );

  const renderFileList = (docType: string) => {
    const files = uploadedFiles[docType];
    if (!files?.length) return null;
    return (
      <div className={inlineStyles.fileList}>
        {files.map(file => (
          <a 
            key={file.id} 
            href={file.file_url} 
            target="_blank" 
            rel="noopener noreferrer" 
            className={inlineStyles.fileLink}
          >
            📄 {file.file_name || 'View'}
          </a>
        ))}
      </div>
    );
  };

  return (
    <>
      {message && (
        <div 
          className={`alert ${message.type === 'success' ? 'alert-success' : 'alert-danger'}`}
          style={{ 
            position: 'fixed', 
            top: '80px', 
            right: '24px', 
            zIndex: 1000,
            animation: 'slideIn 0.2s ease'
          }}
        >
          {message.text}
        </div>
      )}

      {/* Quick Stats */}
      <div className={styles.statsRow}>
        <div className={styles.statItem}>
          <div className="value">
            {driver.status === 'active' ? 'Active' : 'Inactive'}
          </div>
          <div className="label">Status</div>
        </div>
        <div className={styles.statItem}>
          <div className="value">
            {driver.vehicles ? driver.vehicles.registration_number : '—'}
          </div>
          <div className="label">Assigned Vehicle</div>
        </div>
        <div className={styles.statItem}>
          <div className="value">
            {new Date(driver.created_at).toLocaleDateString('en-GB', {
              day: '2-digit',
              month: 'short',
              year: 'numeric',
            })}
          </div>
          <div className="label">Member Since</div>
        </div>
      </div>

      {/* Personal Information */}
      <div className={styles.detailCard}>
        <h3>Personal Information</h3>
        <div className={styles.detailGrid}>
          <InlineEditField
            label="Full Name"
            value={driver.full_name}
            fieldName="full_name"
            onSave={handleSave}
          />
          <InlineEditField
            label="Email"
            value={driver.users?.email}
            fieldName="email"
            onSave={async () => false}
            placeholder="Linked to user account"
          />
          <InlineEditField
            label="Phone"
            value={driver.phone}
            fieldName="phone"
            type="tel"
            onSave={handleSave}
            placeholder="Not set"
          />
          <InlineEditField
            label="Address"
            value={driver.address}
            fieldName="address"
            onSave={handleSave}
            placeholder="Not set"
          />
          <InlineEditField
            label="Status"
            value={driver.status}
            fieldName="status"
            type="select"
            options={[
              { value: 'active', label: 'Active' },
              { value: 'inactive', label: 'Inactive' },
            ]}
            onSave={handleSave}
          />
          <InlineEditField
            label="Employment Type"
            value={driver.employment_type || ''}
            fieldName="employment_type"
            type="select"
            options={[
              { value: '', label: 'Not specified' },
              { value: 'full_time', label: 'Full Time' },
              { value: 'part_time', label: 'Part Time' },
              { value: 'terminated', label: 'Terminated' },
            ]}
            onSave={handleSave}
          />
        </div>
      </div>

      {/* ID & License Information */}
      <div className={styles.detailCard}>
        <h3>ID &amp; License Information</h3>
        <div className={styles.detailGrid}>
          <InlineEditField
            label="ID Card Number"
            value={driver.id_card_number}
            fieldName="id_card_number"
            onSave={handleSave}
            placeholder="Not set"
          />
          <InlineEditField
            label="ID Card Expiry"
            value={driver.id_card_expiry_date}
            fieldName="id_card_expiry_date"
            type="date"
            onSave={handleSave}
            expiryClass={getExpiryClass(driver.id_card_expiry_date)}
            expiryLabel={getExpiryLabel(driver.id_card_expiry_date)}
            placeholder="Not set"
            uploadButton={renderUploadButton('ID_CARD')}
            fileList={renderFileList('ID_CARD')}
          />
          <InlineEditField
            label="Driving License Number"
            value={driver.driving_license_number}
            fieldName="driving_license_number"
            onSave={handleSave}
            placeholder="Not set"
          />
          <InlineEditField
            label="License Expiry"
            value={driver.driving_license_expiry_date}
            fieldName="driving_license_expiry_date"
            type="date"
            onSave={handleSave}
            expiryClass={getExpiryClass(driver.driving_license_expiry_date)}
            expiryLabel={getExpiryLabel(driver.driving_license_expiry_date)}
            placeholder="Not set"
            uploadButton={renderUploadButton('DRIVING_LICENSE')}
            fileList={renderFileList('DRIVING_LICENSE')}
          />
          <InlineEditField
            label="Police Conduct Expiry"
            value={driver.police_conduct_expiry_date}
            fieldName="police_conduct_expiry_date"
            type="date"
            onSave={handleSave}
            expiryClass={getExpiryClass(driver.police_conduct_expiry_date)}
            expiryLabel={getExpiryLabel(driver.police_conduct_expiry_date)}
            placeholder="Not set"
            uploadButton={renderUploadButton('POLICE_CONDUCT')}
            fileList={renderFileList('POLICE_CONDUCT')}
          />
          <InlineEditField
            label="TAG License Expiry"
            value={driver.tag_license_expiry_date}
            fieldName="tag_license_expiry_date"
            type="date"
            onSave={handleSave}
            expiryClass={getExpiryClass(driver.tag_license_expiry_date)}
            expiryLabel={getExpiryLabel(driver.tag_license_expiry_date)}
            placeholder="Not set"
            uploadButton={renderUploadButton('TAG_LICENSE')}
            fileList={renderFileList('TAG_LICENSE')}
          />
        </div>
      </div>

      {/* Assigned Vehicle */}
      <div className={styles.detailCard}>
        <h3>Assigned Vehicles</h3>
        <div className={styles.detailGrid}>
          <div className={styles.detailItem}>
            <span className={styles.detailLabel}>Vehicles</span>
            <div className={styles.detailValue}>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <select
                  value={vehicleToAddId}
                  onChange={(e) => setVehicleToAddId(e.target.value)}
                  className={inlineStyles.input}
                >
                  <option value="">Select vehicle</option>
                  {vehicleOptions
                    .filter((o) => o.value !== '')
                    .map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                </select>
                <button
                  type="button"
                  className={inlineStyles.saveBtn}
                  onClick={addAssignedVehicle}
                  disabled={!vehicleToAddId}
                  title="Add"
                >
                  +
                </button>
              </div>

              {assignedVehicleIds.length > 0 && (
                <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {assignedVehicleIds.map((id) => (
                    <div key={id} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <div style={{ flex: 1 }}>{vehicleLabelById.get(id) || id}</div>
                      <button
                        type="button"
                        className={inlineStyles.saveBtn}
                        onClick={() => removeAssignedVehicle(id)}
                        title="Remove"
                      >
                        -
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div style={{ marginTop: '0.5rem' }}>
                <button
                  type="button"
                  className={inlineStyles.saveBtn}
                  onClick={saveAssignedVehicles}
                  disabled={savingAssignments}
                  title="Save"
                >
                  {savingAssignments ? '...' : '✓'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Shifts */}
      <div className={styles.detailCard}>
        <h3>Recent Shifts</h3>
        {recentShifts && recentShifts.length > 0 ? (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Start Time</th>
                  <th>End Time</th>
                  <th>Starting Mileage</th>
                </tr>
              </thead>
              <tbody>
                {recentShifts.map(shift => (
                  <tr key={shift.id}>
                    <td>{new Date(shift.start_time).toLocaleDateString('en-GB')}</td>
                    <td>{new Date(shift.start_time).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</td>
                    <td>
                      {shift.end_time 
                        ? new Date(shift.end_time).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
                        : <span className="badge badge-success">Active</span>
                      }
                    </td>
                    <td>{shift.starting_mileage.toLocaleString()} km</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-muted">No shifts recorded for this driver.</p>
        )}
      </div>

      {/* Notes */}
      <div className={styles.detailCard}>
        <h3>Notes</h3>
        <InlineEditField
          label=""
          value={driver.notes}
          fieldName="notes"
          type="textarea"
          onSave={handleSave}
          placeholder="No notes"
        />
      </div>

      {/* Record Information */}
      <div className={styles.detailCard}>
        <h3>Record Information</h3>
        <div className={styles.detailGrid}>
          <div className={styles.detailItem}>
            <span className={styles.detailLabel}>Created</span>
            <span className={styles.detailValue}>
              {new Date(driver.created_at).toLocaleString('en-GB')}
            </span>
          </div>
          <div className={styles.detailItem}>
            <span className={styles.detailLabel}>Last Updated</span>
            <span className={styles.detailValue}>
              {new Date(driver.updated_at).toLocaleString('en-GB')}
            </span>
          </div>
        </div>
      </div>
    </>
  );
}
