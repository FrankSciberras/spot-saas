'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import DatePicker from '@/components/shared/DatePicker';
import type { DriverStatus, EmploymentType } from '@/lib/types/database';
import styles from './AdminForms.module.css';

interface PartialVehicle {
  id: string;
  registration_number: string;
  make: string;
  model: string;
  assigned_driver_id?: string | null;
}

interface PartialUser {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
}

interface FileRecord {
  id: string;
  type: string;
  file_url: string;
  file_name: string | null;
  uploaded_at: string;
}

interface PartialDriver {
  id?: string;
  user_id?: string;
  full_name?: string;
  phone?: string | null;
  address?: string | null;
  status?: DriverStatus;
  employment_type?: EmploymentType | null;
  assigned_vehicle_id?: string | null;
  assigned_vehicle_ids?: string[];
  id_card_number?: string | null;
  id_card_expiry_date?: string | null;
  police_conduct_expiry_date?: string | null;
  driving_license_number?: string | null;
  driving_license_expiry_date?: string | null;
  tag_license_expiry_date?: string | null;
  notes?: string | null;
}

interface DriverFormProps {
  driver?: PartialDriver;
  vehicles: PartialVehicle[];
  users: PartialUser[];
  documents?: FileRecord[];
  mode: 'create' | 'edit';
}

export default function DriverForm({ driver, vehicles, users, documents = [], mode }: DriverFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [uploadingType, setUploadingType] = useState<string | null>(null);
  const [vehicleToAddId, setVehicleToAddId] = useState('');
  const [createNewUser, setCreateNewUser] = useState(mode === 'create' && users.length === 0);
  const [newUserData, setNewUserData] = useState({ email: '' });
  const [creatingUser, setCreatingUser] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<Record<string, FileRecord[]>>(() => {
    // Group existing documents by type
    const grouped: Record<string, FileRecord[]> = {};
    documents.forEach(doc => {
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

  const [formData, setFormData] = useState({
    user_id: driver?.user_id || '',
    full_name: driver?.full_name || '',
    phone: driver?.phone || '',
    address: driver?.address || '',
    status: driver?.status || 'active' as DriverStatus,
    employment_type: driver?.employment_type || '' as EmploymentType | '',
    assigned_vehicle_id: driver?.assigned_vehicle_id || '',
    assigned_vehicle_ids: driver?.assigned_vehicle_ids || (driver?.assigned_vehicle_id ? [driver.assigned_vehicle_id] : []),
    id_card_number: driver?.id_card_number || '',
    id_card_expiry_date: driver?.id_card_expiry_date || '',
    police_conduct_expiry_date: driver?.police_conduct_expiry_date || '',
    driving_license_number: driver?.driving_license_number || '',
    driving_license_expiry_date: driver?.driving_license_expiry_date || '',
    tag_license_expiry_date: driver?.tag_license_expiry_date || '',
    notes: driver?.notes || '',
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const addAssignedVehicle = () => {
    if (!vehicleToAddId) return;
    setFormData((prev) => {
      if (prev.assigned_vehicle_ids.includes(vehicleToAddId)) return prev;
      const next = [...prev.assigned_vehicle_ids, vehicleToAddId];
      return {
        ...prev,
        assigned_vehicle_ids: next,
        assigned_vehicle_id: next[0] || '',
      };
    });
    setVehicleToAddId('');
  };

  const removeAssignedVehicle = (vehicleId: string) => {
    setFormData((prev) => {
      const next = prev.assigned_vehicle_ids.filter((id) => id !== vehicleId);
      return {
        ...prev,
        assigned_vehicle_ids: next,
        assigned_vehicle_id: next[0] || '',
      };
    });
  };

  const handleFileUpload = async (docType: string, file: File) => {
    if (!driver?.id) {
      setError('Please save the driver first before uploading documents');
      return;
    }

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
    // Reset input so same file can be selected again
    e.target.value = '';
  };

  const triggerFileInput = (docType: keyof typeof fileInputRefs) => {
    fileInputRefs[docType].current?.click();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      let userId = formData.user_id;

      // If creating a new user, do that first
      if (mode === 'create' && createNewUser) {
        if (!newUserData.email) {
          throw new Error('Email is required to invite a driver');
        }

        setCreatingUser(true);
        const userRes = await fetch('/api/members/invite', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: newUserData.email,
            full_name: formData.full_name,
            role: 'driver',
          }),
        });

        const userData = await userRes.json();
        setCreatingUser(false);

        if (!userRes.ok) {
          throw new Error(userData.error || 'Failed to invite driver');
        }

        userId = userData.data.userId;
      }

      if (!userId) {
        throw new Error('Please select or create a user account');
      }

      const url = mode === 'create' ? '/api/drivers' : `/api/drivers/${driver?.id}`;
      const method = mode === 'create' ? 'POST' : 'PUT';

      const payload = {
        ...formData,
        user_id: userId,
        employment_type: formData.employment_type || null,
        assigned_vehicle_id: formData.assigned_vehicle_ids[0] || formData.assigned_vehicle_id || null,
        assigned_vehicle_ids: formData.assigned_vehicle_ids,
        id_card_expiry_date: formData.id_card_expiry_date || null,
        police_conduct_expiry_date: formData.police_conduct_expiry_date || null,
        driving_license_expiry_date: formData.driving_license_expiry_date || null,
        tag_license_expiry_date: formData.tag_license_expiry_date || null,
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

      setSuccess('Driver created successfully!');
      setTimeout(() => {
        router.push('/fleet/drivers');
        router.refresh();
      }, 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
      setCreatingUser(false);
    }
  };

  // Filter users that are already drivers (for create mode)
  const availableUsers = mode === 'create' ? users.filter(u => u.role === 'driver') : users;

  const availableVehicles = vehicles;

  const vehicleLabelById = new Map(
    availableVehicles.map((v) => [v.id, `${v.registration_number} - ${v.make} ${v.model}`] as const)
  );

  return (
    <form onSubmit={handleSubmit} className={styles.form}>
      {error && (
        <div className="alert alert-danger">
          {error}
        </div>
      )}

      {success && (
        <div className="alert alert-success">
          {success}
        </div>
      )}

      {/* User Account Section - Only for create mode */}
      {mode === 'create' && (
        <div className={styles.formSection}>
          <h3>User Account</h3>
          
          {/* Toggle between existing user and new user */}
          {users.length > 0 && (
            <div className={styles.toggleGroup}>
              <button
                type="button"
                className={`${styles.toggleBtn} ${!createNewUser ? styles.active : ''}`}
                onClick={() => setCreateNewUser(false)}
              >
                Link Existing User
              </button>
              <button
                type="button"
                className={`${styles.toggleBtn} ${createNewUser ? styles.active : ''}`}
                onClick={() => setCreateNewUser(true)}
              >
                Invite New Driver
              </button>
            </div>
          )}

          <div className={styles.formGrid}>
            {createNewUser ? (
              <>
                <div className={styles.formGroup}>
                  <label htmlFor="new_email">Email Address *</label>
                  <input
                    type="email"
                    id="new_email"
                    value={newUserData.email}
                    onChange={(e) => setNewUserData(prev => ({ ...prev, email: e.target.value }))}
                    placeholder="driver@example.com"
                    required
                  />
                  <span className={styles.helpText}>
                    We&apos;ll email this driver an invite to set their own password and join your fleet.
                  </span>
                </div>
              </>
            ) : (
              <div className={styles.formGroup}>
                <label htmlFor="user_id">User Account *</label>
                <select
                  id="user_id"
                  name="user_id"
                  value={formData.user_id}
                  onChange={handleChange}
                  required={!createNewUser}
                >
                  <option value="">Select a user account</option>
                  {availableUsers.map(user => (
                    <option key={user.id} value={user.id}>
                      {user.email} {user.full_name ? `(${user.full_name})` : ''}
                    </option>
                  ))}
                </select>
                <span className={styles.helpText}>Link this driver to an existing user account</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Personal Information Section */}
      <div className={styles.formSection}>
        <h3>Personal Information</h3>
        <div className={styles.formGrid}>

          <div className={styles.formGroup}>
            <label htmlFor="full_name">Full Name *</label>
            <input
              type="text"
              id="full_name"
              name="full_name"
              value={formData.full_name}
              onChange={handleChange}
              required
              placeholder="Enter full name"
            />
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="phone">Phone Number</label>
            <input
              type="tel"
              id="phone"
              name="phone"
              value={formData.phone}
              onChange={handleChange}
              placeholder="+356 9999 9999"
            />
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="address">Address</label>
            <input
              type="text"
              id="address"
              name="address"
              value={formData.address}
              onChange={handleChange}
              placeholder="Enter address"
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
              <option value="inactive">Inactive</option>
            </select>
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="employment_type">Employment Type</label>
            <select
              id="employment_type"
              name="employment_type"
              value={formData.employment_type}
              onChange={handleChange}
            >
              <option value="">Not specified</option>
              <option value="full_time">Full Time</option>
              <option value="part_time">Part Time</option>
              <option value="terminated">Terminated</option>
            </select>
          </div>
        </div>
      </div>

      {/* ID & License Information Section */}
      <div className={styles.formSection}>
        <h3>ID &amp; License Information</h3>
        <div className={styles.formGrid}>
          <div className={styles.formGroup}>
            <label htmlFor="id_card_number">ID Card Number</label>
            <input
              type="text"
              id="id_card_number"
              name="id_card_number"
              value={formData.id_card_number}
              onChange={handleChange}
              placeholder="Enter ID card number"
            />
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="id_card_expiry_date">ID Card Expiry Date</label>
            <div className={styles.inputWithButton}>
              <DatePicker
                value={formData.id_card_expiry_date}
                onChange={(date) => setFormData(prev => ({ ...prev, id_card_expiry_date: date }))}
                placeholder="Select expiry date"
              />
              <input
                type="file"
                ref={fileInputRefs.ID_CARD}
                onChange={handleFileInputChange('ID_CARD')}
                accept=".pdf,.jpg,.jpeg,.png"
                style={{ display: 'none' }}
              />
              <button
                type="button"
                className={styles.uploadBtn}
                onClick={() => triggerFileInput('ID_CARD')}
                disabled={!driver?.id || uploadingType === 'ID_CARD'}
                title={!driver?.id ? 'Save driver first to upload' : 'Upload ID Card'}
              >
                {uploadingType === 'ID_CARD' ? '...' : '📎'}
              </button>
            </div>
            {uploadedFiles.ID_CARD?.length > 0 && (
              <div className={styles.fileList}>
                {uploadedFiles.ID_CARD.map(file => (
                  <a key={file.id} href={file.file_url} target="_blank" rel="noopener noreferrer" className={styles.fileLink}>
                    📄 {file.file_name || 'View Document'}
                  </a>
                ))}
              </div>
            )}
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="driving_license_number">Driving License Number</label>
            <input
              type="text"
              id="driving_license_number"
              name="driving_license_number"
              value={formData.driving_license_number}
              onChange={handleChange}
              placeholder="Enter license number"
            />
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="driving_license_expiry_date">License Expiry Date</label>
            <div className={styles.inputWithButton}>
              <DatePicker
                value={formData.driving_license_expiry_date}
                onChange={(date) => setFormData(prev => ({ ...prev, driving_license_expiry_date: date }))}
                placeholder="Select expiry date"
              />
              <input
                type="file"
                ref={fileInputRefs.DRIVING_LICENSE}
                onChange={handleFileInputChange('DRIVING_LICENSE')}
                accept=".pdf,.jpg,.jpeg,.png"
                style={{ display: 'none' }}
              />
              <button
                type="button"
                className={styles.uploadBtn}
                onClick={() => triggerFileInput('DRIVING_LICENSE')}
                disabled={!driver?.id || uploadingType === 'DRIVING_LICENSE'}
                title={!driver?.id ? 'Save driver first to upload' : 'Upload Driving License'}
              >
                {uploadingType === 'DRIVING_LICENSE' ? '...' : '📎'}
              </button>
            </div>
            {uploadedFiles.DRIVING_LICENSE?.length > 0 && (
              <div className={styles.fileList}>
                {uploadedFiles.DRIVING_LICENSE.map(file => (
                  <a key={file.id} href={file.file_url} target="_blank" rel="noopener noreferrer" className={styles.fileLink}>
                    📄 {file.file_name || 'View Document'}
                  </a>
                ))}
              </div>
            )}
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="police_conduct_expiry_date">Police Conduct Expiry</label>
            <div className={styles.inputWithButton}>
              <DatePicker
                value={formData.police_conduct_expiry_date}
                onChange={(date) => setFormData(prev => ({ ...prev, police_conduct_expiry_date: date }))}
                placeholder="Select expiry date"
              />
              <input
                type="file"
                ref={fileInputRefs.POLICE_CONDUCT}
                onChange={handleFileInputChange('POLICE_CONDUCT')}
                accept=".pdf,.jpg,.jpeg,.png"
                style={{ display: 'none' }}
              />
              <button
                type="button"
                className={styles.uploadBtn}
                onClick={() => triggerFileInput('POLICE_CONDUCT')}
                disabled={!driver?.id || uploadingType === 'POLICE_CONDUCT'}
                title={!driver?.id ? 'Save driver first to upload' : 'Upload Police Conduct'}
              >
                {uploadingType === 'POLICE_CONDUCT' ? '...' : '📎'}
              </button>
            </div>
            {uploadedFiles.POLICE_CONDUCT?.length > 0 && (
              <div className={styles.fileList}>
                {uploadedFiles.POLICE_CONDUCT.map(file => (
                  <a key={file.id} href={file.file_url} target="_blank" rel="noopener noreferrer" className={styles.fileLink}>
                    📄 {file.file_name || 'View Document'}
                  </a>
                ))}
              </div>
            )}
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="tag_license_expiry_date">TAG License Expiry</label>
            <div className={styles.inputWithButton}>
              <DatePicker
                value={formData.tag_license_expiry_date}
                onChange={(date) => setFormData(prev => ({ ...prev, tag_license_expiry_date: date }))}
                placeholder="Select expiry date"
              />
              <input
                type="file"
                ref={fileInputRefs.TAG_LICENSE}
                onChange={handleFileInputChange('TAG_LICENSE')}
                accept=".pdf,.jpg,.jpeg,.png"
                style={{ display: 'none' }}
              />
              <button
                type="button"
                className={styles.uploadBtn}
                onClick={() => triggerFileInput('TAG_LICENSE')}
                disabled={!driver?.id || uploadingType === 'TAG_LICENSE'}
                title={!driver?.id ? 'Save driver first to upload' : 'Upload TAG License'}
              >
                {uploadingType === 'TAG_LICENSE' ? '...' : '📎'}
              </button>
            </div>
            {uploadedFiles.TAG_LICENSE?.length > 0 && (
              <div className={styles.fileList}>
                {uploadedFiles.TAG_LICENSE.map(file => (
                  <a key={file.id} href={file.file_url} target="_blank" rel="noopener noreferrer" className={styles.fileLink}>
                    📄 {file.file_name || 'View Document'}
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Vehicle Assignment Section */}
      <div className={styles.formSection}>
        <h3>Vehicle Assignment</h3>
        <div className={styles.formGrid}>
          <div className={styles.formGroup}>
            <label htmlFor="assigned_vehicle_id">Assigned Vehicle</label>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <select
                id="assigned_vehicle_id"
                name="assigned_vehicle_id"
                value={vehicleToAddId}
                onChange={(e) => setVehicleToAddId(e.target.value)}
              >
                <option value="">Select vehicle</option>
                {availableVehicles.map((vehicle) => (
                  <option key={vehicle.id} value={vehicle.id}>
                    {vehicle.registration_number} - {vehicle.make} {vehicle.model}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={addAssignedVehicle}
                disabled={!vehicleToAddId}
                title="Add"
              >
                +
              </button>
            </div>

            {formData.assigned_vehicle_ids.length > 0 && (
              <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {formData.assigned_vehicle_ids.map((id) => (
                  <div key={id} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <div style={{ flex: 1 }}>{vehicleLabelById.get(id) || id}</div>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => removeAssignedVehicle(id)}
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
            placeholder="Any additional notes about this driver..."
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
          disabled={loading || creatingUser}
        >
          {creatingUser ? 'Creating Account...' : loading ? 'Saving...' : mode === 'create' ? 'Create Driver' : 'Save Changes'}
        </button>
      </div>
    </form>
  );
}
