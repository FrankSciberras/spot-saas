'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import styles from './DriverProfile.module.css';

/* ─── Types ─── */
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
  users?: { id: string; email: string } | null;
  vehicles?: { id: string; registration_number: string; make: string; model: string } | null;
}

interface ShiftRecord {
  id: string;
  start_time: string;
  end_time: string | null;
  starting_mileage: number;
}

interface DriverProfileProps {
  driver: DriverData;
  vehicles: PartialVehicle[];
  documents: FileRecord[];
  recentShifts: ShiftRecord[];
  isAdmin: boolean;
  alsoStaff?: boolean;
}

/* ─── SVG Icons ─── */
const UserIcon = () => (
  <svg viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
);
const FileIcon = () => (
  <svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
);
const TruckIcon = () => (
  <svg viewBox="0 0 24 24"><rect x="1" y="3" width="15" height="13" /><polygon points="16 8 20 8 23 11 23 16 16 16 16 8" /><circle cx="5.5" cy="18.5" r="2.5" /><circle cx="18.5" cy="18.5" r="2.5" /></svg>
);
const ClockIcon = () => (
  <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
);
const ShieldIcon = () => (
  <svg viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
);
const NoteIcon = () => (
  <svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" /></svg>
);
const InfoIcon = () => (
  <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></svg>
);
const UploadIcon = () => (
  <svg viewBox="0 0 24 24"><polyline points="16 16 12 12 8 16" /><line x1="12" y1="12" x2="12" y2="21" /><path d="M20.39 18.39A5 5 0 0018 9h-1.26A8 8 0 103 16.3" /></svg>
);

/* ─── Helpers ─── */
const formatDate = (dateStr: string | null): string => {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

const getExpiryStatus = (dateStr: string | null): 'ok' | 'warning' | 'danger' | null => {
  if (!dateStr) return null;
  const date = new Date(dateStr);
  const now = new Date();
  const thirtyDays = new Date();
  thirtyDays.setDate(now.getDate() + 30);
  if (date < now) return 'danger';
  if (date <= thirtyDays) return 'warning';
  return 'ok';
};

const getExpiryLabel = (dateStr: string | null): string => {
  const status = getExpiryStatus(dateStr);
  if (status === 'danger') return 'Expired';
  if (status === 'warning') return 'Expiring soon';
  return '';
};

const getInitials = (name: string): string => {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
};

const employmentLabel = (et: string | null): string => {
  if (et === 'full_time') return 'Full Time';
  if (et === 'part_time') return 'Part Time';
  if (et === 'terminated') return 'Terminated';
  return 'Not specified';
};

/* ─── Inline Editable Field ─── */
interface EditableFieldProps {
  label: string;
  value: string | null | undefined;
  fieldName: string;
  type?: 'text' | 'date' | 'tel' | 'select' | 'textarea';
  options?: { value: string; label: string }[];
  onSave: (fieldName: string, value: string) => Promise<boolean>;
  placeholder?: string;
  readOnly?: boolean;
  expiryDate?: string | null;
  className?: string;
}

function EditableField({
  label, value, fieldName, type = 'text', options, onSave,
  placeholder = 'Not set', readOnly, expiryDate, className,
}: EditableFieldProps) {
  const [editing, setEditing] = useState(false);
  const [editVal, setEditVal] = useState(value || '');
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) inputRef.current.focus();
  }, [editing]);

  const startEdit = () => {
    if (readOnly) return;
    setEditVal(value || '');
    setEditing(true);
  };

  const cancel = () => { setEditVal(value || ''); setEditing(false); };

  const save = async () => {
    setSaving(true);
    const ok = await onSave(fieldName, editVal);
    setSaving(false);
    if (ok) setEditing(false);
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && type !== 'textarea') { e.preventDefault(); save(); }
    if (e.key === 'Escape') cancel();
  };

  const expiryStatus = expiryDate ? getExpiryStatus(expiryDate) : null;
  const expiryText = expiryDate ? getExpiryLabel(expiryDate) : '';

  if (editing) {
    return (
      <div className={`${styles.field} ${styles.fieldEditing} ${className || ''}`}>
        <span className={styles.fieldLabel}>{label}</span>
        {type === 'select' && options ? (
          <select ref={inputRef as React.RefObject<HTMLSelectElement>} value={editVal} onChange={e => setEditVal(e.target.value)} onKeyDown={onKey} className={styles.fieldInput}>
            {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        ) : type === 'textarea' ? (
          <textarea ref={inputRef as React.RefObject<HTMLTextAreaElement>} value={editVal} onChange={e => setEditVal(e.target.value)} onKeyDown={onKey} className={styles.fieldInput} rows={3} />
        ) : (
          <input ref={inputRef as React.RefObject<HTMLInputElement>} type={type} value={editVal} onChange={e => setEditVal(e.target.value)} onKeyDown={onKey} className={styles.fieldInput} />
        )}
        <div className={styles.fieldActions}>
          <button type="button" onClick={save} disabled={saving} className={styles.fieldSaveBtn}>{saving ? 'Saving...' : 'Save'}</button>
          <button type="button" onClick={cancel} className={styles.fieldCancelBtn}>Cancel</button>
        </div>
      </div>
    );
  }

  const displayVal = type === 'select' && options
    ? options.find(o => o.value === (value || ''))?.label || value || placeholder
    : type === 'date' && value ? formatDate(value) : value;

  return (
    <div className={`${styles.field} ${className || ''}`} onClick={startEdit} role={readOnly ? undefined : 'button'} tabIndex={readOnly ? undefined : 0} onKeyDown={e => { if (!readOnly && e.key === 'Enter') startEdit(); }}>
      <span className={styles.fieldLabel}>{label}</span>
      <div className={styles.fieldValue}>
        {displayVal ? (
          <>
            <span className={expiryStatus === 'danger' ? styles.expiryDanger : expiryStatus === 'warning' ? styles.expiryWarning : undefined}>{displayVal}</span>
            {expiryText && (
              <span className={`${styles.expiryBadge} ${expiryStatus === 'danger' ? styles.expiryBadgeDanger : expiryStatus === 'warning' ? styles.expiryBadgeWarning : styles.expiryBadgeOk}`}>
                {expiryText}
              </span>
            )}
          </>
        ) : (
          <span className={styles.fieldEmpty}>{placeholder}</span>
        )}
      </div>
    </div>
  );
}

/* ─── Document Upload Card ─── */
interface DocCardProps {
  title: string;
  subtitle?: string;
  slots: { label: string; type: string }[];
  files: Record<string, FileRecord[]>;
  driverId: string;
  onUpload: (docType: string, file: File) => Promise<void>;
  onDelete: (fileId: string, docType: string) => Promise<void>;
  uploadingType: string | null;
  deletingId: string | null;
}

function DocCard({ title, subtitle, slots, files, driverId, onUpload, onDelete, uploadingType, deletingId }: DocCardProps) {
  const refs = useRef<Record<string, HTMLInputElement | null>>({});

  return (
    <div className={styles.docCard}>
      <h4 className={styles.docCardTitle}>{title}</h4>
      {subtitle && <p className={styles.docCardSubtitle}>{subtitle}</p>}
      <div className={styles.docSlots}>
        {slots.map(slot => {
          const slotFiles = files[slot.type] || [];
          const isUploading = uploadingType === slot.type;
          return (
            <div key={slot.type} className={styles.docSlot}>
              <span className={styles.docSlotLabel}>{slot.label}</span>
              {slotFiles.length > 0 ? (
                slotFiles.map(f => (
                  <div key={f.id} className={styles.docFileUploaded}>
                    <span className={styles.docFileName}>{f.file_name || 'Document'}</span>
                    <a href={f.file_url} target="_blank" rel="noopener noreferrer" className={styles.docFileViewBtn}>View</a>
                    <button
                      type="button"
                      className={styles.docFileRemoveBtn}
                      onClick={() => onDelete(f.id, slot.type)}
                      disabled={deletingId === f.id}
                      title="Remove file"
                    >
                      {deletingId === f.id ? '...' : '✕'}
                    </button>
                  </div>
                ))
              ) : null}
              <input
                type="file"
                ref={el => { refs.current[slot.type] = el; }}
                onChange={e => { const f = e.target.files?.[0]; if (f) onUpload(slot.type, f); e.target.value = ''; }}
                accept=".pdf,.jpg,.jpeg,.png"
                style={{ display: 'none' }}
              />
              <div
                className={`${styles.docDropzone} ${isUploading ? styles.docUploading : ''}`}
                onClick={() => refs.current[slot.type]?.click()}
              >
                <span className={styles.docDropzoneText}>
                  <UploadIcon />
                  {isUploading ? 'Uploading...' : slotFiles.length > 0 ? 'Replace file' : 'Upload file'}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Main Component
   ═══════════════════════════════════════════════════════════════════════════ */
export default function DriverProfile({ driver: initialDriver, vehicles, documents: initialDocuments, recentShifts, isAdmin, alsoStaff: initialAlsoStaff }: DriverProfileProps) {
  const router = useRouter();
  const [driver, setDriver] = useState(initialDriver);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [alsoStaff, setAlsoStaff] = useState(initialAlsoStaff ?? false);
  const [togglingStaff, setTogglingStaff] = useState(false);
  const [uploadingType, setUploadingType] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [resettingPassword, setResettingPassword] = useState(false);

  /* Vehicle assignment state */
  const [assignedVehicleIds, setAssignedVehicleIds] = useState<string[]>(() =>
    initialDriver.assigned_vehicle_ids || (initialDriver.assigned_vehicle_id ? [initialDriver.assigned_vehicle_id] : [])
  );
  const [vehicleToAddId, setVehicleToAddId] = useState('');
  const [savingAssignments, setSavingAssignments] = useState(false);

  /* Files grouped by type */
  const [uploadedFiles, setUploadedFiles] = useState<Record<string, FileRecord[]>>(() => {
    const grouped: Record<string, FileRecord[]> = {};
    initialDocuments.forEach(doc => {
      if (!grouped[doc.type]) grouped[doc.type] = [];
      grouped[doc.type].push(doc);
    });
    return grouped;
  });

  const showMessage = useCallback((type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 3000);
  }, []);

  /* Load live assignments */
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/drivers/${initialDriver.id}`);
        if (!res.ok) return;
        const data = await res.json();
        const ids = data.data?.assigned_vehicle_ids;
        if (ids) {
          setAssignedVehicleIds(ids);
          setDriver(prev => ({ ...prev, assigned_vehicle_ids: ids }));
        }
      } catch { /* ignore */ }
    })();
  }, [initialDriver.id]);

  /* ── Save Field ── */
  const handleSave = async (fieldName: string, value: string): Promise<boolean> => {
    try {
      const res = await fetch(`/api/drivers/${driver.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [fieldName]: value || null }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed to save'); }
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

  /* ── File Delete ── */
  const handleFileDelete = async (fileId: string, docType: string) => {
    if (!confirm('Remove this file?')) return;
    setDeletingId(fileId);
    try {
      const res = await fetch(`/api/files/${fileId}`, { method: 'DELETE' });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Delete failed'); }
      setUploadedFiles(prev => ({
        ...prev,
        [docType]: (prev[docType] || []).filter(f => f.id !== fileId),
      }));
      showMessage('success', 'File removed');
    } catch (err) {
      showMessage('error', err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setDeletingId(null);
    }
  };

  /* ── File Upload ── */
  const handleFileUpload = async (docType: string, file: File) => {
    setUploadingType(docType);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('owner_type', 'driver');
      formData.append('owner_id', driver.id);
      formData.append('type', docType);
      const res = await fetch('/api/files/upload', { method: 'POST', body: formData });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Upload failed'); }
      const { data: newFile } = await res.json();
      setUploadedFiles(prev => ({ ...prev, [docType]: [...(prev[docType] || []), newFile] }));
      showMessage('success', 'File uploaded');
    } catch (err) {
      showMessage('error', err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploadingType(null);
    }
  };

  /* ── Vehicle Assignment ── */
  const addVehicle = () => {
    if (!vehicleToAddId) return;
    setAssignedVehicleIds(prev => prev.includes(vehicleToAddId) ? prev : [...prev, vehicleToAddId]);
    setVehicleToAddId('');
  };

  const removeVehicle = (vid: string) => setAssignedVehicleIds(prev => prev.filter(id => id !== vid));

  const saveVehicles = async () => {
    setSavingAssignments(true);
    try {
      const res = await fetch(`/api/drivers/${driver.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assigned_vehicle_ids: assignedVehicleIds }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed to save'); }
      showMessage('success', 'Vehicle assignments saved');
      router.refresh();
    } catch (err) {
      showMessage('error', err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSavingAssignments(false);
    }
  };

  /* ── Password Reset ── */
  const handleResetPassword = async () => {
    if (!newPassword || !confirmPassword) { showMessage('error', 'Fill both password fields'); return; }
    if (newPassword.length < 6) { showMessage('error', 'Min 6 characters'); return; }
    if (newPassword !== confirmPassword) { showMessage('error', 'Passwords do not match'); return; }
    if (!driver.user_id) { showMessage('error', 'No user account linked'); return; }
    setResettingPassword(true);
    try {
      const res = await fetch('/api/users/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: driver.user_id, new_password: newPassword }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
      showMessage('success', 'Password reset successfully');
      setNewPassword(''); setConfirmPassword('');
    } catch (err) {
      showMessage('error', err instanceof Error ? err.message : 'Failed');
    } finally {
      setResettingPassword(false);
    }
  };

  /* ── Toggle Staff Access ── */
  const handleToggleStaff = async () => {
    if (!driver.user_id) return;
    setTogglingStaff(true);
    try {
      const res = await fetch(`/api/users/${driver.user_id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ also_staff: !alsoStaff }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed'); }
      setAlsoStaff(!alsoStaff);
      showMessage('success', !alsoStaff ? 'Staff access granted — this driver can now access the admin dashboard' : 'Staff access revoked');
    } catch (err) {
      showMessage('error', err instanceof Error ? err.message : 'Failed to update');
    } finally {
      setTogglingStaff(false);
    }
  };

  const vehicleLabelById = new Map(vehicles.map(v => [v.id, `${v.registration_number} — ${v.make} ${v.model}`]));

  /* ═══════════════════════════════════════════════════════════════════════
     RENDER
     ═══════════════════════════════════════════════════════════════════════ */
  return (
    <div className={styles.container}>
      {/* Toast */}
      {message && (
        <div className={`${styles.toast} ${message.type === 'success' ? styles.toastSuccess : styles.toastError}`}>
          {message.text}
        </div>
      )}

      {/* ── Header ── */}
      <div className={styles.header}>
        <Link href="/admin/drivers" className={styles.backBtn} aria-label="Back to drivers">←</Link>
        <div className={styles.heroCard}>
          <div className={styles.avatar}>{getInitials(driver.full_name)}</div>
          <div className={styles.heroInfo}>
            <h1 className={styles.heroName}>{driver.full_name}</h1>
            <div className={styles.heroBadges}>
              <span className={`badge ${driver.status === 'active' ? 'badge-success' : 'badge-secondary'}`}>
                {driver.status}
              </span>
              <span className="badge badge-info">{employmentLabel(driver.employment_type)}</span>
            </div>
          </div>
          {isAdmin && (
            <div className={styles.heroActions}>
              <Link href={`/admin/drivers/${driver.id}/edit`} className="btn btn-secondary" style={{ fontSize: '13px', padding: '8px 14px' }}>
                Legacy Edit
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* ── Stats Row ── */}
      <div className={styles.statsRow}>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>Status</div>
          <div className={styles.statValue}>{driver.status === 'active' ? 'Active' : 'Inactive'}</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>Vehicle</div>
          <div className={styles.statValue}>{driver.vehicles?.registration_number || '—'}</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>Member Since</div>
          <div className={styles.statValue}>{formatDate(driver.created_at)}</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>Shifts</div>
          <div className={styles.statValue}>{recentShifts.length}</div>
        </div>
      </div>

      {/* ── Personal Information ── */}
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <div className={`${styles.sectionIcon} ${styles.sectionIconBlue}`}><UserIcon /></div>
          <h3 className={styles.sectionTitle}>Personal Information</h3>
        </div>
        <div className={styles.sectionBody}>
          <div className={styles.fieldGrid}>
            <EditableField label="Full Name" value={driver.full_name} fieldName="full_name" onSave={handleSave} />
            <EditableField label="Email" value={driver.users?.email} fieldName="email" onSave={async () => false} readOnly placeholder="Linked to account" />
            <EditableField label="Phone" value={driver.phone} fieldName="phone" type="tel" onSave={handleSave} />
            <EditableField label="Address" value={driver.address} fieldName="address" onSave={handleSave} />
            <EditableField
              label="Status"
              value={driver.status}
              fieldName="status"
              type="select"
              options={[{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }]}
              onSave={handleSave}
            />
            <EditableField
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
      </div>

      {/* ── ID & License ── */}
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <div className={`${styles.sectionIcon} ${styles.sectionIconGreen}`}><ShieldIcon /></div>
          <h3 className={styles.sectionTitle}>ID &amp; License</h3>
        </div>
        <div className={styles.sectionBody}>
          <div className={styles.fieldGrid}>
            <EditableField label="ID Card Number" value={driver.id_card_number} fieldName="id_card_number" onSave={handleSave} />
            <EditableField label="ID Card Expiry" value={driver.id_card_expiry_date} fieldName="id_card_expiry_date" type="date" onSave={handleSave} expiryDate={driver.id_card_expiry_date} />
            <EditableField label="Driving License Number" value={driver.driving_license_number} fieldName="driving_license_number" onSave={handleSave} />
            <EditableField label="License Expiry" value={driver.driving_license_expiry_date} fieldName="driving_license_expiry_date" type="date" onSave={handleSave} expiryDate={driver.driving_license_expiry_date} />
            <EditableField label="Police Conduct Expiry" value={driver.police_conduct_expiry_date} fieldName="police_conduct_expiry_date" type="date" onSave={handleSave} expiryDate={driver.police_conduct_expiry_date} />
            <EditableField label="TAG License Expiry" value={driver.tag_license_expiry_date} fieldName="tag_license_expiry_date" type="date" onSave={handleSave} expiryDate={driver.tag_license_expiry_date} />
          </div>
        </div>
      </div>

      {/* ── Documents ── */}
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <div className={`${styles.sectionIcon} ${styles.sectionIconPurple}`}><FileIcon /></div>
          <h3 className={styles.sectionTitle}>Documents &amp; Attachments</h3>
        </div>
        <div className={styles.sectionBody}>
          <div className={styles.docGrid}>
            <DocCard
              title="ID Card"
              subtitle="National identity card — front and back"
              slots={[
                { label: 'Front', type: 'ID_CARD_FRONT' },
                { label: 'Back', type: 'ID_CARD_BACK' },
              ]}
              files={uploadedFiles}
              driverId={driver.id}
              onUpload={handleFileUpload}
              onDelete={handleFileDelete}
              uploadingType={uploadingType}
              deletingId={deletingId}
            />
            <DocCard
              title="Driving License"
              subtitle="Valid driving license — front and back"
              slots={[
                { label: 'Front', type: 'DRIVING_LICENSE_FRONT' },
                { label: 'Back', type: 'DRIVING_LICENSE_BACK' },
              ]}
              files={uploadedFiles}
              driverId={driver.id}
              onUpload={handleFileUpload}
              onDelete={handleFileDelete}
              uploadingType={uploadingType}
              deletingId={deletingId}
            />
            <DocCard
              title="Police Conduct"
              subtitle="Certificate of good conduct"
              slots={[{ label: 'Document', type: 'POLICE_CONDUCT' }]}
              files={uploadedFiles}
              driverId={driver.id}
              onUpload={handleFileUpload}
              onDelete={handleFileDelete}
              uploadingType={uploadingType}
              deletingId={deletingId}
            />
            <DocCard
              title="TAG License"
              subtitle="TAG operator license"
              slots={[{ label: 'Document', type: 'TAG_LICENSE' }]}
              files={uploadedFiles}
              driverId={driver.id}
              onUpload={handleFileUpload}
              onDelete={handleFileDelete}
              uploadingType={uploadingType}
              deletingId={deletingId}
            />
          </div>
          {/* Show legacy uploads (files uploaded under old types) */}
          {(uploadedFiles['ID_CARD']?.length || uploadedFiles['DRIVING_LICENSE']?.length) ? (
            <div style={{ marginTop: 16, padding: '12px 14px', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', fontSize: 'var(--font-xs)', color: 'var(--text-muted)' }}>
              <strong>Legacy uploads:</strong> Some files were uploaded before front/back was available.
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                {(uploadedFiles['ID_CARD'] || []).map(f => (
                  <a key={f.id} href={f.file_url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-primary)', fontSize: 12 }}>
                    ID Card — {f.file_name || 'View'}
                  </a>
                ))}
                {(uploadedFiles['DRIVING_LICENSE'] || []).map(f => (
                  <a key={f.id} href={f.file_url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-primary)', fontSize: 12 }}>
                    License — {f.file_name || 'View'}
                  </a>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* ── Assigned Vehicles ── */}
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <div className={`${styles.sectionIcon} ${styles.sectionIconOrange}`}><TruckIcon /></div>
          <h3 className={styles.sectionTitle}>Assigned Vehicles</h3>
        </div>
        <div className={styles.sectionBody}>
          {assignedVehicleIds.length > 0 ? (
            <div className={styles.vehicleList}>
              {assignedVehicleIds.map(vid => (
                <div key={vid} className={styles.vehicleRow}>
                  <div className={styles.vehicleInfo}>
                    <Link href={`/admin/vehicles/${vid}`} className={styles.vehicleReg}>
                      {vehicleLabelById.get(vid) || vid}
                    </Link>
                  </div>
                  {isAdmin && (
                    <button type="button" className={styles.vehicleRemoveBtn} onClick={() => removeVehicle(vid)} title="Remove">✕</button>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className={styles.emptyState}>No vehicles assigned</p>
          )}
          {isAdmin && (
            <>
              <div className={styles.vehicleAddRow}>
                <select value={vehicleToAddId} onChange={e => setVehicleToAddId(e.target.value)} className={styles.vehicleSelect}>
                  <option value="">Select vehicle to add...</option>
                  {vehicles.filter(v => !assignedVehicleIds.includes(v.id)).map(v => (
                    <option key={v.id} value={v.id}>{v.registration_number} — {v.make} {v.model}</option>
                  ))}
                </select>
                <button type="button" className={styles.vehicleAddBtn} onClick={addVehicle} disabled={!vehicleToAddId}>Add</button>
              </div>
              <button
                type="button"
                className={`btn btn-primary ${styles.vehicleSaveBtn}`}
                onClick={saveVehicles}
                disabled={savingAssignments}
                style={{ fontSize: 13, padding: '8px 20px' }}
              >
                {savingAssignments ? 'Saving...' : 'Save Assignments'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── Recent Shifts ── */}
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <div className={`${styles.sectionIcon} ${styles.sectionIconBlue}`}><ClockIcon /></div>
          <h3 className={styles.sectionTitle}>Recent Shifts</h3>
        </div>
        <div className={styles.sectionBody}>
          {recentShifts.length > 0 ? (
            <div className={styles.shiftList}>
              <div className={`${styles.shiftRow} ${styles.shiftRowHeader}`}>
                <span>Date</span><span>Start</span><span>End</span><span>Mileage</span>
              </div>
              {recentShifts.map(shift => (
                <div key={shift.id} className={styles.shiftRow}>
                  <span className={styles.shiftDate}>{new Date(shift.start_time).toLocaleDateString('en-GB')}</span>
                  <span className={styles.shiftTime}>{new Date(shift.start_time).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span>
                  <span className={styles.shiftTime}>
                    {shift.end_time
                      ? new Date(shift.end_time).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
                      : <span className="badge badge-success">Active</span>
                    }
                  </span>
                  <span className={styles.shiftMileage}>{shift.starting_mileage.toLocaleString()} km</span>
                </div>
              ))}
            </div>
          ) : (
            <p className={styles.emptyState}>No shifts recorded</p>
          )}
        </div>
      </div>

      {/* ── Notes ── */}
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <div className={`${styles.sectionIcon} ${styles.sectionIconGray}`}><NoteIcon /></div>
          <h3 className={styles.sectionTitle}>Notes</h3>
        </div>
        <div className={styles.sectionBody}>
          <EditableField
            label=""
            value={driver.notes}
            fieldName="notes"
            type="textarea"
            onSave={handleSave}
            placeholder="Click to add notes..."
            className={styles.fieldFull}
          />
        </div>
      </div>

      {/* ── Staff Access ── */}
      {isAdmin && driver.user_id && (
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <div className={`${styles.sectionIcon} ${styles.sectionIconPurple}`}><ShieldIcon /></div>
            <h3 className={styles.sectionTitle}>Staff Access</h3>
          </div>
          <div className={styles.sectionBody}>
            <p className={styles.passwordHint}>
              {alsoStaff
                ? 'This driver currently has staff access and can use the admin dashboard with staff-level permissions.'
                : 'Grant this driver staff access so they can also use the admin dashboard (e.g. a driver who is also a manager).'}
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
              <button
                type="button"
                onClick={handleToggleStaff}
                disabled={togglingStaff}
                className={alsoStaff ? 'btn btn-secondary' : 'btn btn-primary'}
                style={{ fontSize: 13, padding: '8px 20px' }}
              >
                {togglingStaff ? 'Updating...' : alsoStaff ? 'Revoke Staff Access' : 'Grant Staff Access'}
              </button>
              {alsoStaff && (
                <span className="badge badge-success" style={{ fontSize: 11 }}>Staff access active</span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Account Security ── */}
      {isAdmin && driver.user_id && (
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <div className={`${styles.sectionIcon} ${styles.sectionIconRed}`}><ShieldIcon /></div>
            <h3 className={styles.sectionTitle}>Account Security</h3>
          </div>
          <div className={styles.sectionBody}>
            <p className={styles.passwordHint}>Set a new password for this driver. They can log in with the new password immediately.</p>
            <div className={styles.passwordGrid}>
              <input
                type="password"
                placeholder="New password (min. 6 characters)"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                className={styles.passwordInput}
                minLength={6}
              />
              <input
                type="password"
                placeholder="Confirm new password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                className={styles.passwordInput}
                minLength={6}
              />
              <button
                type="button"
                onClick={handleResetPassword}
                disabled={resettingPassword || !newPassword || !confirmPassword}
                className="btn btn-primary"
                style={{ alignSelf: 'flex-start', fontSize: 13, padding: '8px 20px' }}
              >
                {resettingPassword ? 'Resetting...' : 'Reset Password'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Record Information ── */}
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <div className={`${styles.sectionIcon} ${styles.sectionIconGray}`}><InfoIcon /></div>
          <h3 className={styles.sectionTitle}>Record Information</h3>
        </div>
        <div className={styles.sectionBody}>
          <div className={styles.metaGrid}>
            <div className={styles.metaItem}>
              <span className={styles.metaLabel}>Created</span>
              <span className={styles.metaValue}>{new Date(driver.created_at).toLocaleString('en-GB')}</span>
            </div>
            <div className={styles.metaItem}>
              <span className={styles.metaLabel}>Last Updated</span>
              <span className={styles.metaValue}>{new Date(driver.updated_at).toLocaleString('en-GB')}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
