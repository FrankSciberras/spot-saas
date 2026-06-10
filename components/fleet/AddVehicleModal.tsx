'use client';

import type { CSSProperties } from 'react';
import { useEffect, useRef, useState } from 'react';
import FleetIcon from './FleetIcon';

interface CreatedVehicle {
  id: string;
  registration_number: string;
  make: string;
  model: string;
  status: string;
}

interface AddVehicleModalProps {
  open: boolean;
  onClose: () => void;
  /** Called with the freshly-created vehicle once the API responds. */
  onCreated?: (vehicle: CreatedVehicle) => void;
}

/**
 * Quick "add a vehicle" modal. POSTs to /api/vehicles so admins can register a
 * car without leaving the current page. Full details (VIN, documents, mileage
 * history) still live on the dedicated /fleet/vehicles/new page.
 *
 * Styled from the fleet theme tokens (renders inside .fleetCanvas) so it tracks
 * the dark/light toggle and brand colour. Animations live in fleet-theme.css.
 */
export default function AddVehicleModal({ open, onClose, onCreated }: AddVehicleModalProps) {
  const [plate, setPlate] = useState('');
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [year, setYear] = useState('');
  const [status, setStatus] = useState('active');
  const [vehicleModelId, setVehicleModelId] = useState('');
  const [vehicleModels, setVehicleModels] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);

  // Load car-model diagram presets (managed by the platform admin) for the dropdown.
  useEffect(() => {
    let active = true;
    fetch('/api/vehicle-models')
      .then((r) => (r.ok ? r.json() : { data: [] }))
      .then((json) => { if (active) setVehicleModels(json.data || []); })
      .catch(() => { /* non-fatal */ });
    return () => { active = false; };
  }, []);

  // Reset + focus when opened; close on Escape.
  useEffect(() => {
    if (!open) return;
    setError(null);
    const t = setTimeout(() => firstFieldRef.current?.focus(), 60);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !loading) onClose(); };
    document.addEventListener('keydown', onKey);
    return () => { clearTimeout(t); document.removeEventListener('keydown', onKey); };
  }, [open, loading, onClose]);

  const reset = () => {
    setPlate(''); setMake(''); setModel(''); setYear(''); setStatus('active'); setVehicleModelId(''); setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!plate.trim() || !make.trim() || !model.trim()) {
      setError('Registration, make and model are required.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/vehicles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          registration_number: plate.trim().toUpperCase(),
          make: make.trim(),
          model: model.trim(),
          year: year.trim() ? Number(year) : undefined,
          status,
          vehicle_model_id: vehicleModelId || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create vehicle');

      onCreated?.(data.data);
      reset();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div
      style={st.overlay}
      className="fleetModalOverlay"
      onMouseDown={() => { if (!loading) onClose(); }}
    >
      <div
        style={st.modal}
        className="fleetModalCard"
        role="dialog"
        aria-modal="true"
        aria-label="Add vehicle"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div style={st.header}>
          <div style={st.headerIco}>
            <FleetIcon name="vehicle" size={18} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 style={st.title}>Add a vehicle</h3>
            <p style={st.subtitle}>Register a car — add documents &amp; details later.</p>
          </div>
          <button type="button" style={st.closeBtn} className="fleetHover" onClick={onClose} aria-label="Close">
            <FleetIcon name="close" size={16} stroke={2} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={st.body}>
          {error && <div style={st.error}>{error}</div>}

          <div style={st.field}>
            <label style={st.label} htmlFor="qav-plate">Registration number *</label>
            <input
              id="qav-plate"
              ref={firstFieldRef}
              style={st.input}
              value={plate}
              onChange={(e) => setPlate(e.target.value)}
              placeholder="e.g. 12-D-4471"
              disabled={loading}
              required
            />
          </div>

          <div style={st.grid2}>
            <div style={st.field}>
              <label style={st.label} htmlFor="qav-make">Make *</label>
              <input id="qav-make" style={st.input} value={make} onChange={(e) => setMake(e.target.value)} placeholder="e.g. Toyota" disabled={loading} required />
            </div>
            <div style={st.field}>
              <label style={st.label} htmlFor="qav-model">Model *</label>
              <input id="qav-model" style={st.input} value={model} onChange={(e) => setModel(e.target.value)} placeholder="e.g. Yaris Cross" disabled={loading} required />
            </div>
          </div>

          <div style={st.grid2}>
            <div style={st.field}>
              <label style={st.label} htmlFor="qav-year">Year</label>
              <input id="qav-year" type="number" min="1950" max="2100" style={st.input} value={year} onChange={(e) => setYear(e.target.value)} placeholder="e.g. 2024" disabled={loading} />
            </div>
            <div style={st.field}>
              <label style={st.label} htmlFor="qav-status">Status</label>
              <select id="qav-status" style={st.input} value={status} onChange={(e) => setStatus(e.target.value)} disabled={loading}>
                <option value="active">Active</option>
                <option value="in_service">In service</option>
                <option value="out_of_service">Out of service</option>
              </select>
            </div>
          </div>

          <div style={st.field}>
            <label style={st.label} htmlFor="qav-model-preset">Car model / diagram</label>
            <select id="qav-model-preset" style={st.input} value={vehicleModelId} onChange={(e) => setVehicleModelId(e.target.value)} disabled={loading}>
              <option value="">— No diagram —</option>
              {vehicleModels.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>

          <p style={st.note}>
            Need VIN, insurance, mileage or a driver assignment? Use the full{' '}
            <a href="/fleet/vehicles/new" style={{ color: 'var(--accent)' }}>vehicle page</a>.
          </p>

          <div style={st.actions}>
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={loading}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={loading || !plate.trim() || !make.trim() || !model.trim()}>
              {loading ? 'Creating…' : 'Create vehicle'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const st: Record<string, CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    zIndex: 1000,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    background: 'rgba(4, 6, 12, 0.55)',
    backdropFilter: 'blur(3px)',
  },
  modal: {
    width: '100%',
    maxWidth: 460,
    background: 'var(--bg-1)',
    border: '1px solid var(--line-2)',
    borderRadius: 'var(--radius-lg)',
    boxShadow: 'var(--shadow-elevated)',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 12,
    padding: '18px 18px 14px',
    borderBottom: '1px solid var(--line-1)',
  },
  headerIco: {
    flexShrink: 0,
    width: 38,
    height: 38,
    display: 'grid',
    placeItems: 'center',
    borderRadius: 10,
    background: 'var(--accent-soft)',
    border: '1px solid var(--accent-line)',
    color: 'var(--accent)',
  },
  title: { margin: 0, fontSize: 16, fontWeight: 600, letterSpacing: '-0.01em', color: 'var(--text-1)' },
  subtitle: { margin: '3px 0 0', fontSize: 12.5, color: 'var(--text-3)', lineHeight: 1.4 },
  closeBtn: {
    flexShrink: 0,
    width: 30,
    height: 30,
    display: 'grid',
    placeItems: 'center',
    background: 'transparent',
    border: '1px solid var(--line-2)',
    borderRadius: 8,
    color: 'var(--text-2)',
    cursor: 'pointer',
  },
  body: { padding: 18, display: 'flex', flexDirection: 'column', gap: 14 },
  grid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 },
  field: { display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 },
  label: { fontSize: 12, fontWeight: 500, color: 'var(--text-2)' },
  input: {
    width: '100%',
    padding: '10px 12px',
    background: 'var(--bg-0)',
    border: '1px solid var(--line-2)',
    borderRadius: 9,
    color: 'var(--text-1)',
    fontSize: 13.5,
    fontFamily: 'inherit',
    outline: 'none',
  },
  note: { margin: '-2px 0 2px', fontSize: 11.5, color: 'var(--text-3)', lineHeight: 1.45 },
  error: {
    padding: '10px 12px',
    borderRadius: 9,
    background: 'var(--neg-soft)',
    border: '1px solid var(--neg)',
    color: 'var(--neg)',
    fontSize: 13,
  },
  actions: { marginTop: 4, display: 'flex', gap: 10, justifyContent: 'flex-end' },
};
