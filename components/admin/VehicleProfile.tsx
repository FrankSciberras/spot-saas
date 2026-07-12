'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import DeleteVehicleButton from './DeleteVehicleButton';
import FleetIcon from '@/components/fleet/FleetIcon';
import styles from './VehicleProfile.module.css';

/* ─── Types ─── */
interface FileRecord {
  id: string;
  type: string;
  file_url: string;
  file_name: string | null;
  uploaded_at: string;
}

interface DriverInfo {
  id: string;
  full_name: string;
  phone?: string | null;
}

interface ServiceRecord {
  id: string;
  service_date: string;
  service_type: string;
  mileage_at_service: number;
  next_service_mileage: number | null;
  cost: number | null;
  currency: string;
}

interface ShiftRecord {
  id: string;
  start_time: string;
  end_time: string | null;
  starting_mileage: number;
  drivers: { full_name: string } | null;
}

interface VehicleData {
  id: string;
  registration_number: string;
  make: string;
  model: string;
  year: number | null;
  mileage: number;
  status: 'active' | 'in_service' | 'out_of_service';
  assigned_driver_id: string | null;
  insurance_expiry_date: string | null;
  road_license_expiry_date: string | null;
  color: string | null;
  notes: string | null;
  vehicle_model_id: string | null;
  created_at: string;
  updated_at: string;
  drivers?: DriverInfo | null;
}

interface VehicleProfileProps {
  vehicle: VehicleData;
  documents: FileRecord[];
  assignedDrivers: DriverInfo[];
  recentShifts: ShiftRecord[];
  serviceHistory: ServiceRecord[];
  nextServiceDue: { next_service_mileage: number; mileage_at_service: number } | null;
  /** Published car-model diagram presets (id + name) for the "Car diagram" picker. */
  vehicleModels: { id: string; name: string }[];
  isAdmin: boolean;
}

/* ─── SVG Icons ─── */
const UploadIcon = () => (
  <svg viewBox="0 0 24 24"><polyline points="16 16 12 12 8 16" /><line x1="12" y1="12" x2="12" y2="21" /><path d="M20.39 18.39A5 5 0 0018 9h-1.26A8 8 0 103 16.3" /></svg>
);

/* ─── Helpers ─── */
const formatDate = (d: string | null): string => {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

const getExpiryStatus = (d: string | null): 'ok' | 'warning' | 'danger' | null => {
  if (!d) return null;
  const date = new Date(d), now = new Date(), soon = new Date();
  soon.setDate(now.getDate() + 30);
  if (date < now) return 'danger';
  if (date <= soon) return 'warning';
  return 'ok';
};

const getExpiryLabel = (d: string | null): string => {
  const s = getExpiryStatus(d);
  if (s === 'danger') return 'Expired';
  if (s === 'warning') return 'Expiring soon';
  return '';
};

const statusLabel = (s: string) => s.replace(/_/g, ' ');
const statusBadge = (s: string) => s === 'active' ? 'badge-success' : s === 'in_service' ? 'badge-warning' : 'badge-danger';

const SERVICE_TYPE_LABELS: Record<string, string> = {
  oil_change: 'Oil Change', tire_rotation: 'Tire Rotation', tire_replacement: 'Tire Replacement',
  brake_service: 'Brake Service', brake_pads: 'Brake Pads', brake_discs: 'Brake Discs',
  air_filter: 'Air Filter', cabin_filter: 'Cabin Filter', spark_plugs: 'Spark Plugs',
  battery: 'Battery', transmission: 'Transmission', coolant_flush: 'Coolant Flush',
  timing_belt: 'Timing Belt', general_inspection: 'General Inspection', annual_service: 'Annual Service',
  major_service: 'Major Service', repair: 'Repair', other: 'Other',
};

/* ─── Editable Field ─── */
interface EditableFieldProps {
  label: string;
  value: string | null | undefined;
  fieldName: string;
  type?: 'text' | 'number' | 'date' | 'select' | 'textarea';
  options?: { value: string; label: string }[];
  onSave: (fieldName: string, value: string) => Promise<boolean>;
  placeholder?: string;
  readOnly?: boolean;
  expiryDate?: string | null;
  suffix?: string;
  className?: string;
  /** Skip thousands grouping for number fields (e.g. a year — 2023, not 2,023). */
  plain?: boolean;
}

function EditableField({
  label, value, fieldName, type = 'text', options, onSave,
  placeholder = 'Not set', readOnly, expiryDate, suffix, className, plain,
}: EditableFieldProps) {
  const [editing, setEditing] = useState(false);
  const [editVal, setEditVal] = useState(value?.toString() || '');
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(null);

  useEffect(() => { if (editing && inputRef.current) inputRef.current.focus(); }, [editing]);

  const startEdit = () => { if (readOnly) return; setEditVal(value?.toString() || ''); setEditing(true); };
  const cancel = () => { setEditVal(value?.toString() || ''); setEditing(false); };
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
          <input ref={inputRef as React.RefObject<HTMLInputElement>} type={type === 'number' ? 'number' : type} value={editVal} onChange={e => setEditVal(e.target.value)} onKeyDown={onKey} className={styles.fieldInput} />
        )}
        <div className={styles.fieldActions}>
          <button type="button" onClick={save} disabled={saving} className={styles.fieldSaveBtn}>{saving ? 'Saving...' : 'Save'}</button>
          <button type="button" onClick={cancel} className={styles.fieldCancelBtn}>Cancel</button>
        </div>
      </div>
    );
  }

  let displayVal: string | null = null;
  if (type === 'select' && options) displayVal = options.find(o => o.value === (value?.toString() || ''))?.label || value?.toString() || null;
  else if (type === 'date' && value) displayVal = formatDate(value.toString());
  else if (type === 'number' && value) displayVal = (plain ? String(value) : Number(value).toLocaleString()) + (suffix || '');
  else displayVal = value?.toString() || null;

  const numClass = type === 'number' || type === 'date' ? 'mono tnum' : '';

  return (
    <div className={`${styles.field} ${className || ''}`} onClick={startEdit} role={readOnly ? undefined : 'button'} tabIndex={readOnly ? undefined : 0} onKeyDown={e => { if (!readOnly && e.key === 'Enter') startEdit(); }}>
      <span className={styles.fieldLabel}>{label}</span>
      <div className={styles.fieldValue}>
        {displayVal ? (
          <>
            <span className={[numClass, expiryStatus === 'danger' ? styles.expiryDanger : expiryStatus === 'warning' ? styles.expiryWarning : ''].filter(Boolean).join(' ') || undefined}>
              {displayVal}{suffix && type !== 'number' ? ` ${suffix}` : ''}
            </span>
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
  docType: string;
  files: FileRecord[];
  onUpload: (docType: string, file: File) => Promise<void>;
  onDelete: (fileId: string, docType: string) => Promise<void>;
  uploadingType: string | null;
  deletingId: string | null;
}

function DocCard({ title, subtitle, docType, files, onUpload, onDelete, uploadingType, deletingId }: DocCardProps) {
  const ref = useRef<HTMLInputElement>(null);
  const isUploading = uploadingType === docType;

  return (
    <div className={styles.docCard}>
      <h4 className={styles.docCardTitle}>{title}</h4>
      {subtitle && <p className={styles.docCardSub}>{subtitle}</p>}
      {files.map(f => (
        <div key={f.id} className={styles.docFileUploaded}>
          <span className={styles.docFileName}>{f.file_name || 'Document'}</span>
          <a href={`/api/files/${f.id}/view`} target="_blank" rel="noopener noreferrer" className={styles.docFileViewBtn}>View</a>
          <button
            type="button"
            className={styles.docFileRemoveBtn}
            onClick={() => onDelete(f.id, docType)}
            disabled={deletingId === f.id}
            title="Remove file"
          >
            {deletingId === f.id ? '...' : '✕'}
          </button>
        </div>
      ))}
      <input
        type="file"
        ref={ref}
        onChange={e => { const f = e.target.files?.[0]; if (f) onUpload(docType, f); e.target.value = ''; }}
        accept=".pdf,.jpg,.jpeg,.png"
        style={{ display: 'none' }}
      />
      <div className={`${styles.docDropzone} ${isUploading ? styles.docUploading : ''}`} onClick={() => ref.current?.click()}>
        <span className={styles.docDropzoneText}>
          <UploadIcon />
          {isUploading ? 'Uploading...' : files.length > 0 ? 'Upload another' : 'Upload file'}
        </span>
      </div>
    </div>
  );
}

/* ─── Stat Card (dashboard-style: icon chip + tabular number) ─── */
function StatCard({ icon, label, value, sub, accent }: {
  icon: string; label: string; value: React.ReactNode; sub?: string; accent: string;
}) {
  return (
    <div className={styles.statCard}>
      <div className={styles.statIcon} style={{ color: accent }}><FleetIcon name={icon} size={15} /></div>
      <div className={`${styles.statValue} mono tnum`} style={{ color: accent }}>{value}</div>
      <div className={styles.statLabel}>{label}</div>
      {sub && <div className={styles.statSub}>{sub}</div>}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Main Component
   ═══════════════════════════════════════════════════════════════════════════ */
export default function VehicleProfile({
  vehicle: initialVehicle, documents: initialDocuments,
  assignedDrivers, recentShifts, serviceHistory,
  nextServiceDue, vehicleModels, isAdmin,
}: VehicleProfileProps) {
  const router = useRouter();
  const [vehicle, setVehicle] = useState(initialVehicle);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [uploadingType, setUploadingType] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

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

  /* ── Save Field ── */
  const handleSave = async (fieldName: string, value: string): Promise<boolean> => {
    try {
      const body: Record<string, unknown> = {};
      if (fieldName === 'year' || fieldName === 'mileage') {
        body[fieldName] = value ? Number(value) : null;
      } else {
        body[fieldName] = value || null;
      }
      const res = await fetch(`/api/vehicles/${vehicle.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed to save'); }
      await res.json();
      setVehicle(prev => ({ ...prev, [fieldName]: body[fieldName] }));
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
      formData.append('owner_type', 'vehicle');
      formData.append('owner_id', vehicle.id);
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

  const kmUntilService = nextServiceDue?.next_service_mileage
    ? nextServiceDue.next_service_mileage - vehicle.mileage
    : null;

  // Stat-card figures (chosen to complement the hero + info grid, not repeat them).
  const driverCount = assignedDrivers.length || (vehicle.drivers ? 1 : 0);
  const docCount = Object.values(uploadedFiles).reduce((sum, arr) => sum + arr.length, 0);
  let nextServiceValue = '—', nextServiceSub = 'Not scheduled', nextServiceColor = 'var(--text-3)';
  if (kmUntilService !== null) {
    if (kmUntilService <= 0) {
      nextServiceValue = `${Math.abs(kmUntilService).toLocaleString()} km`;
      nextServiceSub = 'Overdue'; nextServiceColor = 'var(--neg)';
    } else {
      nextServiceValue = `${kmUntilService.toLocaleString()} km`;
      nextServiceSub = 'Remaining'; nextServiceColor = kmUntilService <= 2000 ? 'var(--warn)' : 'var(--accent)';
    }
  }

  // Options for the inline "Car diagram" picker (admin-editable). "" = no diagram.
  const diagramOptions = [
    { value: '', label: '— No diagram —' },
    ...vehicleModels.map((m) => ({ value: m.id, label: m.name })),
  ];

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
        <Link href="/fleet/vehicles" className={styles.backLink}>
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
          Back to vehicles
        </Link>
        <div className={styles.heroCard}>
          <div className={styles.avatar}><FleetIcon name="vehicle" size={26} /></div>
          <div className={styles.heroInfo}>
            <h1 className={styles.heroName}>{vehicle.registration_number}</h1>
            <span className={styles.heroSub}>{vehicle.make} {vehicle.model}{vehicle.year ? ` (${vehicle.year})` : ''}</span>
            <div className={styles.heroBadges}>
              <span className={`badge ${statusBadge(vehicle.status)}`}>{statusLabel(vehicle.status)}</span>
              {vehicle.color && <span className="badge badge-info">{vehicle.color}</span>}
            </div>
          </div>
          <div className={styles.heroActions}>
            <Link href={`/fleet/vehicles/${vehicle.id}/damages`} className="btn btn-secondary" style={{ fontSize: 13, padding: '8px 14px' }}>
              Damages
            </Link>
            {isAdmin && <DeleteVehicleButton vehicleId={vehicle.id} vehicleReg={vehicle.registration_number} />}
          </div>
        </div>
      </div>

      {/* ── Stats Row ── */}
      <div className={styles.statsRow}>
        <StatCard icon="vehicle" label="Mileage" value={`${vehicle.mileage?.toLocaleString() || 0} km`} accent="var(--text-1)" />
        <StatCard icon="wrench" label="Next service" value={nextServiceValue} sub={nextServiceSub} accent={nextServiceColor} />
        <StatCard icon="driver" label="Assigned drivers" value={driverCount} accent="var(--text-1)" />
        <StatCard icon="doc" label="Documents" value={docCount} accent="var(--text-1)" />
      </div>

      {/* ── Vehicle Information ── */}
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <div className={`${styles.sectionIcon} ${styles.sectionIconBlue}`}><FleetIcon name="vehicle" size={16} /></div>
          <h3 className={styles.sectionTitle}>Vehicle Information</h3>
        </div>
        <div className={styles.sectionBody}>
          <div className={styles.fieldGrid}>
            <EditableField label="Registration Number" value={vehicle.registration_number} fieldName="registration_number" onSave={handleSave} readOnly={!isAdmin} />
            <EditableField label="Make" value={vehicle.make} fieldName="make" onSave={handleSave} readOnly={!isAdmin} />
            <EditableField label="Model" value={vehicle.model} fieldName="model" onSave={handleSave} readOnly={!isAdmin} />
            <EditableField label="Year" value={vehicle.year?.toString()} fieldName="year" type="number" plain onSave={handleSave} readOnly={!isAdmin} />
            <EditableField label="Color" value={vehicle.color} fieldName="color" onSave={handleSave} readOnly={!isAdmin} />
            <EditableField label="Mileage" value={vehicle.mileage?.toString()} fieldName="mileage" type="number" onSave={handleSave} suffix=" km" readOnly={!isAdmin} />
            <EditableField
              label="Car diagram"
              value={vehicle.vehicle_model_id}
              fieldName="vehicle_model_id"
              type="select"
              options={diagramOptions}
              onSave={handleSave}
              placeholder="— No diagram —"
              readOnly={!isAdmin}
            />
            <EditableField
              label="Status"
              value={vehicle.status}
              fieldName="status"
              type="select"
              options={[
                { value: 'active', label: 'Active' },
                { value: 'in_service', label: 'In Service' },
                { value: 'out_of_service', label: 'Out of Service' },
              ]}
              onSave={handleSave}
              readOnly={!isAdmin}
              className={styles.fieldFull}
            />
          </div>
        </div>
      </div>

      {/* ── Documents & Expiry ── */}
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <div className={`${styles.sectionIcon} ${styles.sectionIconGreen}`}><FleetIcon name="book" size={16} /></div>
          <h3 className={styles.sectionTitle}>Documents &amp; Expiry</h3>
        </div>
        <div className={styles.sectionBody}>
          {/* Expiry dates inline */}
          <div className={styles.fieldGrid} style={{ marginBottom: 20 }}>
            <EditableField label="Insurance Expiry" value={vehicle.insurance_expiry_date} fieldName="insurance_expiry_date" type="date" onSave={handleSave} expiryDate={vehicle.insurance_expiry_date} readOnly={!isAdmin} />
            <EditableField label="Road License Expiry" value={vehicle.road_license_expiry_date} fieldName="road_license_expiry_date" type="date" onSave={handleSave} expiryDate={vehicle.road_license_expiry_date} readOnly={!isAdmin} />
          </div>
          {/* Document upload cards */}
          <div className={styles.docGrid}>
            <DocCard title="Vehicle Insurance" subtitle="Insurance policy document" docType="VEHICLE_INSURANCE" files={uploadedFiles['VEHICLE_INSURANCE'] || []} onUpload={handleFileUpload} onDelete={handleFileDelete} uploadingType={uploadingType} deletingId={deletingId} />
            <DocCard title="Road License" subtitle="Road license / VRT" docType="ROAD_LICENSE" files={uploadedFiles['ROAD_LICENSE'] || []} onUpload={handleFileUpload} onDelete={handleFileDelete} uploadingType={uploadingType} deletingId={deletingId} />
            <DocCard title="Logbook" subtitle="Vehicle registration logbook" docType="LOGBOOK" files={uploadedFiles['LOGBOOK'] || []} onUpload={handleFileUpload} onDelete={handleFileDelete} uploadingType={uploadingType} deletingId={deletingId} />
            <DocCard title="Other Documents" subtitle="Any other vehicle documents" docType="OTHER" files={uploadedFiles['OTHER'] || []} onUpload={handleFileUpload} onDelete={handleFileDelete} uploadingType={uploadingType} deletingId={deletingId} />
          </div>
        </div>
      </div>

      {/* ── Service & Maintenance ── */}
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <div className={`${styles.sectionIcon} ${styles.sectionIconOrange}`}><FleetIcon name="wrench" size={16} /></div>
          <h3 className={styles.sectionTitle}>Service &amp; Maintenance</h3>
          <div className={styles.sectionHeaderActions}>
            <Link href={`/fleet/services/new?vehicle=${vehicle.id}`} className="btn btn-primary" style={{ fontSize: 12, padding: '6px 14px' }}>
              + Add Service
            </Link>
          </div>
        </div>
        <div className={styles.sectionBody}>
          {/* Service Due Alert */}
          {kmUntilService !== null && (
            <div className={`${styles.serviceAlert} ${kmUntilService <= 500 ? styles.serviceAlertRed : kmUntilService <= 2000 ? styles.serviceAlertOrange : styles.serviceAlertGreen}`}>
              <div>
                <div className={styles.serviceAlertLabel} style={{ color: kmUntilService <= 500 ? 'var(--neg)' : kmUntilService <= 2000 ? 'var(--warn)' : 'var(--pos)' }}>
                  Next Service Due
                </div>
                <div className={`${styles.serviceAlertSub} mono tnum`}>
                  at {nextServiceDue?.next_service_mileage?.toLocaleString()} km
                </div>
              </div>
              <span className={`${styles.serviceAlertValue} mono tnum`} style={{ color: kmUntilService <= 500 ? 'var(--neg)' : kmUntilService <= 2000 ? 'var(--warn)' : 'var(--pos)' }}>
                {kmUntilService <= 0
                  ? `${Math.abs(kmUntilService).toLocaleString()} km overdue`
                  : `${kmUntilService.toLocaleString()} km remaining`
                }
              </span>
            </div>
          )}

          {serviceHistory.length > 0 ? (
            <div className={styles.listGrid}>
              <div className={`${styles.listRow} ${styles.serviceRow} ${styles.listRowHeader}`}>
                <span>Date</span><span>Service</span><span>Mileage</span><span>Next Due</span><span>Cost</span><span></span>
              </div>
              {serviceHistory.map(s => (
                <div key={s.id} className={`${styles.listRow} ${styles.serviceRow}`}>
                  <span className={`${styles.listDate} mono tnum`}>{formatDate(s.service_date)}</span>
                  <span className={styles.listText}>{SERVICE_TYPE_LABELS[s.service_type] || s.service_type}</span>
                  <span className={`${styles.listText} mono tnum`}>{s.mileage_at_service.toLocaleString()} km</span>
                  <span className={`${styles.listText} mono tnum`}>{s.next_service_mileage ? `${s.next_service_mileage.toLocaleString()} km` : '—'}</span>
                  <span className={`${styles.listText} mono tnum`}>{s.cost ? `${s.currency} ${s.cost.toFixed(2)}` : '—'}</span>
                  <Link href={`/fleet/services/${s.id}`} className={styles.listLink}>View</Link>
                </div>
              ))}
              <div style={{ textAlign: 'center', paddingTop: 12 }}>
                <Link href={`/fleet/services?vehicle_id=${vehicle.id}`} className={styles.listLink}>View All Services →</Link>
              </div>
            </div>
          ) : (
            <p className={styles.emptyState}>No service records</p>
          )}
        </div>
      </div>

      {/* ── Assigned Drivers ── */}
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <div className={`${styles.sectionIcon} ${styles.sectionIconPurple}`}><FleetIcon name="driver" size={16} /></div>
          <h3 className={styles.sectionTitle}>Assigned Drivers</h3>
        </div>
        <div className={styles.sectionBody}>
          {assignedDrivers.length > 0 ? (
            <div className={styles.driverList}>
              {assignedDrivers.map(d => (
                <div key={d.id} className={styles.driverRow}>
                  <div className={styles.driverInfo}>
                    <Link href={`/fleet/drivers/${d.id}`} className={styles.driverName}>{d.full_name}</Link>
                    {d.phone && <div className={styles.driverPhone}>{d.phone}</div>}
                  </div>
                </div>
              ))}
            </div>
          ) : vehicle.drivers ? (
            <div className={styles.driverList}>
              <div className={styles.driverRow}>
                <div className={styles.driverInfo}>
                  <Link href={`/fleet/drivers/${vehicle.drivers.id}`} className={styles.driverName}>{vehicle.drivers.full_name}</Link>
                  {vehicle.drivers.phone && <div className={styles.driverPhone}>{vehicle.drivers.phone}</div>}
                </div>
              </div>
            </div>
          ) : (
            <p className={styles.emptyState}>No driver assigned</p>
          )}
        </div>
      </div>

      {/* ── Recent Shifts ── */}
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <div className={`${styles.sectionIcon} ${styles.sectionIconBlue}`}><FleetIcon name="shift" size={16} /></div>
          <h3 className={styles.sectionTitle}>Recent Shifts</h3>
        </div>
        <div className={styles.sectionBody}>
          {recentShifts.length > 0 ? (
            <div className={styles.listGrid}>
              <div className={`${styles.listRow} ${styles.shiftRow} ${styles.listRowHeader}`}>
                <span>Date</span><span>Driver</span><span>Start</span><span>End</span><span>Mileage</span>
              </div>
              {recentShifts.map(shift => (
                <div key={shift.id} className={`${styles.listRow} ${styles.shiftRow}`}>
                  <span className={`${styles.listDate} mono tnum`}>{new Date(shift.start_time).toLocaleDateString('en-GB')}</span>
                  <span className={styles.listText}>{(shift.drivers as unknown as { full_name: string } | null)?.full_name || '—'}</span>
                  <span className={`${styles.listText} mono tnum`}>{new Date(shift.start_time).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span>
                  <span className={`${styles.listText} mono tnum`}>
                    {shift.end_time
                      ? new Date(shift.end_time).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
                      : <span className="badge badge-success">Active</span>
                    }
                  </span>
                  <span className={`${styles.listText} mono tnum`}>{shift.starting_mileage.toLocaleString()} km</span>
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
          <div className={`${styles.sectionIcon} ${styles.sectionIconGray}`}><FleetIcon name="doc" size={16} /></div>
          <h3 className={styles.sectionTitle}>Notes</h3>
        </div>
        <div className={styles.sectionBody}>
          <EditableField
            label=""
            value={vehicle.notes}
            fieldName="notes"
            type="textarea"
            onSave={handleSave}
            placeholder="Click to add notes..."
            className={styles.fieldFull}
            readOnly={!isAdmin}
          />
        </div>
      </div>

      {/* ── Record Information ── */}
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <div className={`${styles.sectionIcon} ${styles.sectionIconGray}`}><FleetIcon name="audit" size={16} /></div>
          <h3 className={styles.sectionTitle}>Record Information</h3>
        </div>
        <div className={styles.sectionBody}>
          <div className={styles.metaGrid}>
            <div className={styles.metaItem}>
              <span className={styles.metaLabel}>Added to Fleet</span>
              <span className={styles.metaValue}>{new Date(vehicle.created_at).toLocaleString('en-GB')}</span>
            </div>
            <div className={styles.metaItem}>
              <span className={styles.metaLabel}>Last Updated</span>
              <span className={styles.metaValue}>{new Date(vehicle.updated_at).toLocaleString('en-GB')}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
