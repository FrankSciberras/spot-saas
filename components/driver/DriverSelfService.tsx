'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { updateMyDriverProfileAction } from '@/lib/actions/driver-profile';
import styles from '@/app/driver/profile/profile.module.css';

interface DocType {
  key: string;
  label: string;
}

interface Props {
  driverId: string;
  initialPhone: string | null;
  initialAddress: string | null;
  docTypes: DocType[];
}

/**
 * Driver self-service: edit own contact details + upload own documents.
 * Contact edits go through a server action with a strict column allowlist;
 * uploads reuse the (org-validated) /api/files/upload endpoint.
 */
export default function DriverSelfService({ driverId, initialPhone, initialAddress, docTypes }: Props) {
  const router = useRouter();

  const [phone, setPhone] = useState(initialPhone ?? '');
  const [address, setAddress] = useState(initialAddress ?? '');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [docType, setDocType] = useState(docTypes[0]?.key ?? '');
  const [uploading, setUploading] = useState(false);

  const flash = (type: 'success' | 'error', text: string) => {
    setMsg({ type, text });
    setTimeout(() => setMsg(null), 4000);
  };

  const saveContact = async () => {
    setSaving(true);
    try {
      const res = await updateMyDriverProfileAction({ phone, address });
      if (res.error) flash('error', res.error);
      else {
        flash('success', 'Details saved');
        router.refresh();
      }
    } finally {
      setSaving(false);
    }
  };

  const upload = async (file: File) => {
    if (!docType) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('owner_type', 'driver');
      fd.append('owner_id', driverId);
      fd.append('type', docType);
      const res = await fetch('/api/files/upload', { method: 'POST', body: fd });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || 'Upload failed');
      }
      flash('success', 'Document uploaded');
      router.refresh();
    } catch (err) {
      flash('error', err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <svg viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" fill="none">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
        </svg>
        <h3>Update My Details</h3>
      </div>
      <div className={styles.cardContent}>
        {msg && (
          <p
            role="status"
            style={{
              margin: '0 0 12px',
              padding: '8px 12px',
              borderRadius: 8,
              fontSize: 14,
              background: msg.type === 'success' ? 'var(--color-success-bg, #e6f7ec)' : 'var(--color-danger-bg, #fdeaea)',
              color: msg.type === 'success' ? 'var(--color-success, #137a3e)' : 'var(--color-danger, #b3261e)',
            }}
          >
            {msg.text}
          </p>
        )}

        <div style={{ display: 'grid', gap: 12, maxWidth: 480 }}>
          <label style={{ display: 'grid', gap: 4, fontSize: 13, fontWeight: 600 }}>
            Phone
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="e.g. +356 9900 0000"
              style={{ padding: '10px 12px', border: '1px solid var(--border-color, #d9d9e3)', borderRadius: 8, fontSize: 14 }}
            />
          </label>
          <label style={{ display: 'grid', gap: 4, fontSize: 13, fontWeight: 600 }}>
            Address
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Your home address"
              style={{ padding: '10px 12px', border: '1px solid var(--border-color, #d9d9e3)', borderRadius: 8, fontSize: 14 }}
            />
          </label>
          <div>
            <button type="button" className="btn btn-primary" onClick={saveContact} disabled={saving}>
              {saving ? 'Saving…' : 'Save details'}
            </button>
          </div>
        </div>

        <hr style={{ margin: '20px 0', border: 0, borderTop: '1px solid var(--border-color, #ececf1)' }} />

        <div style={{ display: 'grid', gap: 12, maxWidth: 480 }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>Upload a document</span>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <select
              value={docType}
              onChange={(e) => setDocType(e.target.value)}
              style={{ padding: '10px 12px', border: '1px solid var(--border-color, #d9d9e3)', borderRadius: 8, fontSize: 14 }}
            >
              {docTypes.map((d) => (
                <option key={d.key} value={d.key}>{d.label}</option>
              ))}
            </select>
            <label className="btn btn-secondary" style={{ cursor: uploading ? 'wait' : 'pointer' }}>
              {uploading ? 'Uploading…' : 'Choose file'}
              <input
                type="file"
                accept="application/pdf,image/jpeg,image/png"
                hidden
                disabled={uploading}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) upload(f);
                  e.target.value = '';
                }}
              />
            </label>
          </div>
          <span style={{ fontSize: 12, color: 'var(--text-muted, #6b6b78)' }}>
            PDF, JPG or PNG · max 10MB. Your fleet will see the uploaded document.
          </span>
        </div>
      </div>
    </div>
  );
}
