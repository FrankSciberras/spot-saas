'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import FleetIcon from '@/components/fleet/FleetIcon';
import CarDiagram, { ZONE_LABELS } from './CarDiagram';
import type {
  VehicleDamage,
  DamageZone,
  DamageSeverity,
  DamageStatus,
  CreateDamageInput,
  UpdateDamageInput,
} from '@/lib/types/database';
import styles from './damages.module.css';

interface VehicleDamageTrackerProps {
  vehicleId: string;
  initialDamages: VehicleDamage[];
  isAdmin: boolean;
  sideZoneConfig?: Record<string, { path: string; hoverColor?: string }>;
  topZoneConfig?: Record<string, { path: string; hoverColor?: string }>;
  sideImageUrl?: string;
  topImageUrl?: string;
}

const ALL_ZONES: DamageZone[] = Object.keys(ZONE_LABELS) as DamageZone[];

const SEVERITY_OPTIONS: { value: DamageSeverity; label: string }[] = [
  { value: 'minor', label: 'Minor' },
  { value: 'moderate', label: 'Moderate' },
  { value: 'severe', label: 'Severe' },
];

const STATUS_OPTIONS: { value: DamageStatus; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'monitoring', label: 'Monitoring' },
  { value: 'repaired', label: 'Repaired' },
];

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export default function VehicleDamageTracker({ vehicleId, initialDamages, isAdmin, sideZoneConfig, topZoneConfig, sideImageUrl, topImageUrl }: VehicleDamageTrackerProps) {
  const [damages, setDamages] = useState<VehicleDamage[]>(initialDamages);
  const [selectedZone, setSelectedZone] = useState<DamageZone | null>(null);
  const [hoveredZone, setHoveredZone] = useState<DamageZone | null>(null);
  const [filterSeverity, setFilterSeverity] = useState<DamageSeverity | ''>('');
  const [filterStatus, setFilterStatus] = useState<DamageStatus | ''>('');

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editingDamage, setEditingDamage] = useState<VehicleDamage | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Lightbox
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);

  // Delete confirm
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Form state
  const [formZone, setFormZone] = useState<DamageZone>('front_bumper');
  const [formDescription, setFormDescription] = useState('');
  const [formSeverity, setFormSeverity] = useState<DamageSeverity>('minor');
  const [formStatus, setFormStatus] = useState<DamageStatus>('open');
  const [formRepairCost, setFormRepairCost] = useState('');
  const [formCurrency, setFormCurrency] = useState('EUR');
  const [formNotes, setFormNotes] = useState('');
  const [formImages, setFormImages] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Compute zone damage map
  const zoneDamages = useCallback(() => {
    const map: Record<string, { count: number; maxSeverity: DamageSeverity }> = {};
    const severityRank: Record<DamageSeverity, number> = { minor: 0, moderate: 1, severe: 2 };

    for (const d of damages) {
      if (d.status === 'repaired') continue;
      if (!map[d.zone]) {
        map[d.zone] = { count: 0, maxSeverity: d.severity };
      }
      map[d.zone].count++;
      if (severityRank[d.severity] > severityRank[map[d.zone].maxSeverity]) {
        map[d.zone].maxSeverity = d.severity;
      }
    }
    return map;
  }, [damages]);

  // Filtered damages
  const filteredDamages = damages.filter((d) => {
    if (selectedZone && d.zone !== selectedZone) return false;
    if (filterSeverity && d.severity !== filterSeverity) return false;
    if (filterStatus && d.status !== filterStatus) return false;
    return true;
  });

  // Stats
  const openCount = damages.filter((d) => d.status === 'open').length;
  const monitoringCount = damages.filter((d) => d.status === 'monitoring').length;
  const repairedCount = damages.filter((d) => d.status === 'repaired').length;
  const severeCount = damages.filter((d) => d.severity === 'severe' && d.status !== 'repaired').length;

  const resetForm = () => {
    setFormZone('front_bumper');
    setFormDescription('');
    setFormSeverity('minor');
    setFormStatus('open');
    setFormRepairCost('');
    setFormCurrency('EUR');
    setFormNotes('');
    setFormImages([]);
    setEditingDamage(null);
    setError(null);
  };

  const openAddModal = (zone?: DamageZone) => {
    resetForm();
    if (zone) setFormZone(zone);
    setShowModal(true);
  };

  const openEditModal = (damage: VehicleDamage) => {
    setEditingDamage(damage);
    setFormZone(damage.zone);
    setFormDescription(damage.description);
    setFormSeverity(damage.severity);
    setFormStatus(damage.status);
    setFormRepairCost(damage.repair_cost?.toString() || '');
    setFormCurrency(damage.currency);
    setFormNotes(damage.notes || '');
    setFormImages(damage.images || []);
    setError(null);
    setShowModal(true);
  };

  const handleZoneClick = (zone: DamageZone) => {
    if (selectedZone === zone) {
      setSelectedZone(null);
    } else {
      setSelectedZone(zone);
    }
  };

  // Image upload
  const handleImageUpload = async (files: FileList) => {
    setUploading(true);
    setError(null);
    const newUrls: string[] = [];
    const uploadErrors: string[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const formData = new FormData();
      formData.append('file', file);
      formData.append('owner_type', 'vehicle');
      formData.append('owner_id', vehicleId);
      formData.append('type', 'OTHER');

      try {
        const res = await fetch('/api/files/upload', { method: 'POST', body: formData });
        if (res.ok) {
          const { data } = await res.json();
          // Store the authenticated proxy URL (not the raw bucket URL) — the
          // documents bucket is private, so this resolves a fresh signed URL on
          // each load and is stable to persist.
          newUrls.push(`/api/files/${data.id}/view`);
        } else {
          const data = await res.json().catch(() => null);
          uploadErrors.push(data?.error || `Failed to upload ${file.name}`);
        }
      } catch {
        uploadErrors.push(`Failed to upload ${file.name}`);
      }
    }

    if (newUrls.length > 0) {
      setFormImages((prev) => [...prev, ...newUrls]);
    }

    if (uploadErrors.length > 0) {
      setError(uploadErrors[0]);
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }

    setUploading(false);
  };

  const removeImage = (index: number) => {
    setFormImages((prev) => prev.filter((_, i) => i !== index));
  };

  // Save damage (create or update). Description is optional — the zone +
  // severity already identify the damage, so we don't block on it.
  const handleSave = async () => {
    setSaving(true);
    setError(null);

    try {
      if (editingDamage) {
        const body: UpdateDamageInput = {
          zone: formZone,
          description: formDescription,
          severity: formSeverity,
          status: formStatus,
          repair_cost: formRepairCost ? parseFloat(formRepairCost) : null,
          currency: formCurrency,
          images: formImages,
          notes: formNotes || undefined,
          repaired_at: formStatus === 'repaired' && !editingDamage.repaired_at
            ? new Date().toISOString()
            : formStatus !== 'repaired'
              ? null
              : undefined,
        };

        const res = await fetch(`/api/vehicles/${vehicleId}/damages/${editingDamage.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || 'Failed to update');
        }

        const { data: updated } = await res.json();
        setDamages((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
      } else {
        const body: CreateDamageInput = {
          vehicle_id: vehicleId,
          zone: formZone,
          description: formDescription,
          severity: formSeverity,
          status: formStatus,
          repair_cost: formRepairCost ? parseFloat(formRepairCost) : undefined,
          currency: formCurrency,
          images: formImages,
          notes: formNotes || undefined,
        };

        const res = await fetch(`/api/vehicles/${vehicleId}/damages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || 'Failed to create');
        }

        const { data: created } = await res.json();
        setDamages((prev) => [created, ...prev]);
      }

      setShowModal(false);
      resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setSaving(false);
    }
  };

  // Delete damage
  const handleDelete = async (damageId: string) => {
    try {
      const res = await fetch(`/api/vehicles/${vehicleId}/damages/${damageId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setDamages((prev) => prev.filter((d) => d.id !== damageId));
        setDeletingId(null);
      }
    } catch {
      // Ignore
    }
  };

  // Close lightbox on escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (lightboxImage) setLightboxImage(null);
        else if (showModal) setShowModal(false);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [lightboxImage, showModal]);

  const getSeverityClass = (severity: DamageSeverity) => {
    switch (severity) {
      case 'minor': return styles.severityMinor;
      case 'moderate': return styles.severityModerate;
      case 'severe': return styles.severitySevere;
    }
  };

  const getStatusClass = (status: DamageStatus) => {
    switch (status) {
      case 'open': return styles.statusOpen;
      case 'monitoring': return styles.statusMonitoring;
      case 'repaired': return styles.statusRepaired;
    }
  };

  return (
    <div>
      {/* Stats */}
      <div className={styles.statsRow}>
        <div className={styles.statCard}>
          <div className={styles.statIcon} style={{ color: 'var(--text-2)' }}>
            <FleetIcon name="audit" size={15} />
          </div>
          <div className={styles.statValue}>{damages.length}</div>
          <div className={styles.statLabel}>Total damages</div>
          <div className={styles.statSub}>all records</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statIcon} style={{ color: 'var(--neg)' }}>
            <FleetIcon name="warning" size={15} />
          </div>
          <div className={`${styles.statValue} ${styles.statValueDanger}`}>{openCount}</div>
          <div className={styles.statLabel}>Open</div>
          <div className={styles.statSub}>need attention</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statIcon} style={{ color: 'var(--warn)' }}>
            <FleetIcon name="shift" size={15} />
          </div>
          <div className={`${styles.statValue} ${styles.statValueWarning}`}>{monitoringCount}</div>
          <div className={styles.statLabel}>Monitoring</div>
          <div className={styles.statSub}>being watched</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statIcon} style={{ color: 'var(--pos)' }}>
            <FleetIcon name="check" size={15} />
          </div>
          <div className={`${styles.statValue} ${styles.statValueSuccess}`}>{repairedCount}</div>
          <div className={styles.statLabel}>Repaired</div>
          <div className={styles.statSub}>resolved</div>
        </div>
      </div>

      {/* Car Diagram */}
      <CarDiagram
        zoneDamages={zoneDamages()}
        selectedZone={selectedZone}
        onZoneClick={handleZoneClick}
        hoveredZone={hoveredZone}
        onZoneHover={setHoveredZone}
        sideZoneConfig={sideZoneConfig}
        topZoneConfig={topZoneConfig}
        sideImageUrl={sideImageUrl}
        topImageUrl={topImageUrl}
      />

      {/* Legend */}
      <div className={styles.legend}>
        <div className={styles.legendItem}>
          <span className={`${styles.legendDot} ${styles.legendDotNone}`} />
          No damage
        </div>
        <div className={styles.legendItem}>
          <span className={`${styles.legendDot} ${styles.legendDotMinor}`} />
          Minor
        </div>
        <div className={styles.legendItem}>
          <span className={`${styles.legendDot} ${styles.legendDotModerate}`} />
          Moderate
        </div>
        <div className={styles.legendItem}>
          <span className={`${styles.legendDot} ${styles.legendDotSevere}`} />
          Severe
        </div>
        {severeCount > 0 && (
          <div className={styles.legendItem} style={{ marginLeft: 'auto', color: '#ef4444', fontWeight: 600 }}>
            {severeCount} severe issue{severeCount !== 1 ? 's' : ''}
          </div>
        )}
      </div>

      {/* Filters + Add button */}
      <div className={styles.filters}>
        {selectedZone && (
          <div className={styles.filterGroup}>
            <span className={styles.filterLabel}>Zone:</span>
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>
              {ZONE_LABELS[selectedZone]}
            </span>
            <button className={styles.clearFilter} onClick={() => setSelectedZone(null)}>
              Clear
            </button>
          </div>
        )}

        <div className={styles.filterGroup}>
          <span className={styles.filterLabel}>Severity:</span>
          <select
            className={styles.filterSelect}
            value={filterSeverity}
            onChange={(e) => setFilterSeverity(e.target.value as DamageSeverity | '')}
          >
            <option value="">All</option>
            {SEVERITY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        <div className={styles.filterGroup}>
          <span className={styles.filterLabel}>Status:</span>
          <select
            className={styles.filterSelect}
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as DamageStatus | '')}
          >
            <option value="">All</option>
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        <div style={{ marginLeft: 'auto' }}>
          <button className="btn btn-primary" onClick={() => openAddModal(selectedZone || undefined)}>
            + Add Damage
          </button>
        </div>
      </div>

      {/* Damage Cards */}
      {filteredDamages.length > 0 ? (
        <div className={styles.damageList}>
          {filteredDamages.map((damage) => (
            <div
              key={damage.id}
              className={`${styles.damageCard} ${selectedZone === damage.zone ? styles.damageCardSelected : ''}`}
            >
              <div className={styles.damageCardHeader}>
                <div className={styles.damageCardInfo}>
                  <div className={styles.damageZone}>{ZONE_LABELS[damage.zone] || damage.zone}</div>
                  <div className={styles.damageDescription}>{damage.description}</div>
                </div>
                <div className={styles.damageBadges}>
                  <span className={`${styles.severityBadge} ${getSeverityClass(damage.severity)}`}>
                    {damage.severity}
                  </span>
                  <span className={`${styles.statusBadge} ${getStatusClass(damage.status)}`}>
                    {damage.status}
                  </span>
                </div>
              </div>

              <div className={styles.damageCardMeta}>
                <span>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>
                  {formatDate(damage.reported_at)}
                </span>
                {damage.repair_cost !== null && damage.repair_cost > 0 && (
                  <span>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M12 6v12M8 9.5h5.5a2.5 2.5 0 010 5H8" /></svg>
                    {damage.currency} {damage.repair_cost.toFixed(2)}
                  </span>
                )}
                {damage.repaired_at && (
                  <span style={{ color: '#16a34a' }}>
                    Repaired: {formatDate(damage.repaired_at)}
                  </span>
                )}
              </div>

              {damage.images && damage.images.length > 0 && (
                <div className={styles.damageImages}>
                  {damage.images.map((url, i) => (
                    <img
                      key={i}
                      src={url}
                      alt={`Damage photo ${i + 1}`}
                      className={styles.damageImageThumb}
                      onClick={() => setLightboxImage(url)}
                    />
                  ))}
                </div>
              )}

              {damage.notes && (
                <div className={styles.damageNotes}>{damage.notes}</div>
              )}

              <div className={styles.damageCardActions}>
                <button className="btn btn-sm btn-outline" onClick={() => openEditModal(damage)}>
                  Edit
                </button>
                {isAdmin && (
                  deletingId === damage.id ? (
                    <>
                      <button
                        className="btn btn-sm btn-danger"
                        onClick={() => handleDelete(damage.id)}
                      >
                        Confirm
                      </button>
                      <button
                        className="btn btn-sm btn-secondary"
                        onClick={() => setDeletingId(null)}
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button
                      className="btn btn-sm btn-danger"
                      onClick={() => setDeletingId(damage.id)}
                    >
                      Delete
                    </button>
                  )
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.4">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              <path d="M9 12l2 2 4-4" />
            </svg>
          </div>
          <div className={styles.emptyTitle}>
            {selectedZone ? `No damages on ${ZONE_LABELS[selectedZone]}` : 'No damages recorded'}
          </div>
          <div className={styles.emptyText}>
            {selectedZone
              ? 'This zone has no damage reports. Click the button below to add one.'
              : 'Click on a zone in the diagram above or use the button to report a damage.'
            }
          </div>
          <button className="btn btn-primary" onClick={() => openAddModal(selectedZone || undefined)}>
            + Add Damage
          </button>
        </div>
      )}

      {/* Add/Edit Modal */}
      {showModal && (
        <div className={styles.modalOverlay} onClick={() => setShowModal(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <span className={styles.modalTitle}>
                {editingDamage ? 'Edit Damage' : 'Report New Damage'}
              </span>
              <button className={styles.modalClose} onClick={() => setShowModal(false)}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className={styles.modalBody}>
              {error && (
                <div className="alert alert-danger" style={{ margin: 0 }}>{error}</div>
              )}

              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Zone *</label>
                  <select
                    className={styles.formSelect}
                    value={formZone}
                    onChange={(e) => setFormZone(e.target.value as DamageZone)}
                  >
                    {ALL_ZONES.map((z) => (
                      <option key={z} value={z}>{ZONE_LABELS[z]}</option>
                    ))}
                  </select>
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Severity *</label>
                  <select
                    className={styles.formSelect}
                    value={formSeverity}
                    onChange={(e) => setFormSeverity(e.target.value as DamageSeverity)}
                  >
                    {SEVERITY_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Description</label>
                <textarea
                  className={styles.formTextarea}
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="Describe the damage..."
                />
              </div>

              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Status</label>
                  <select
                    className={styles.formSelect}
                    value={formStatus}
                    onChange={(e) => setFormStatus(e.target.value as DamageStatus)}
                  >
                    {STATUS_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Repair Cost</label>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <select
                      className={styles.formSelect}
                      value={formCurrency}
                      onChange={(e) => setFormCurrency(e.target.value)}
                      style={{ width: '70px', flexShrink: 0 }}
                    >
                      <option value="EUR">EUR</option>
                      <option value="USD">USD</option>
                      <option value="GBP">GBP</option>
                    </select>
                    <input
                      type="number"
                      className={styles.formInput}
                      value={formRepairCost}
                      onChange={(e) => setFormRepairCost(e.target.value)}
                      placeholder="0.00"
                      step="0.01"
                      min="0"
                      style={{ flex: 1 }}
                    />
                  </div>
                </div>
              </div>

              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Notes</label>
                <textarea
                  className={styles.formTextarea}
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  placeholder="Additional notes..."
                  style={{ minHeight: '50px' }}
                />
              </div>

              {/* Image Upload */}
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Photos</label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/jpg"
                  multiple
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    if (e.target.files && e.target.files.length > 0) {
                      handleImageUpload(e.target.files);
                      e.target.value = '';
                    }
                  }}
                />
                <div
                  className={styles.imageUploadArea}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <div className={styles.imageUploadLabel}>
                    {uploading ? (
                      'Uploading...'
                    ) : (
                      <>
                        <strong>Click to upload</strong> or drag photos here
                        <br />
                        <span style={{ fontSize: '0.7rem' }}>JPG, PNG up to 10MB</span>
                      </>
                    )}
                  </div>
                </div>

                {formImages.length > 0 && (
                  <div className={styles.uploadedImages}>
                    {formImages.map((url, i) => (
                      <div key={i} className={styles.uploadedImageWrap}>
                        <img src={url} alt={`Upload ${i + 1}`} className={styles.uploadedImage} />
                        <button
                          type="button"
                          className={styles.removeImageBtn}
                          onClick={() => removeImage(i)}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className={styles.modalFooter}>
              <button className="btn btn-secondary" onClick={() => setShowModal(false)} disabled={saving}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving || uploading}>
                {saving ? 'Saving...' : editingDamage ? 'Update Damage' : 'Add Damage'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Image Lightbox */}
      {lightboxImage && (
        <div className={styles.lightbox} onClick={() => setLightboxImage(null)}>
          <img
            src={lightboxImage}
            alt="Damage photo"
            className={styles.lightboxImage}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
