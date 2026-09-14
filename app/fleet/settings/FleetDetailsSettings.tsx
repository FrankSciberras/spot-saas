'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { getFleetDetailsAction, updateFleetDetailsAction, type FleetDetails } from '@/lib/actions/fleet-details';
import styles from './settings.module.css';

type Form = {
  name: string;
  legal_name: string;
  vat_number: string;
  contact_email: string;
  contact_phone: string;
  address: string;
  website: string;
  speed_limit_kmh: string;
};

const EMPTY: Form = { name: '', legal_name: '', vat_number: '', contact_email: '', contact_phone: '', address: '', website: '', speed_limit_kmh: '' };

function toForm(d: FleetDetails): Form {
  return {
    name: d.name ?? '',
    legal_name: d.legal_name ?? '',
    vat_number: d.vat_number ?? '',
    contact_email: d.contact_email ?? '',
    contact_phone: d.contact_phone ?? '',
    address: d.address ?? '',
    website: d.website ?? '',
    speed_limit_kmh: d.speed_limit_kmh != null ? String(d.speed_limit_kmh) : '',
  };
}

/**
 * "Fleet details" card on /fleet/settings: the fleet's display name, business
 * identity (for settlement PDFs) and contact details drivers can see.
 */
export default function FleetDetailsSettings() {
  const router = useRouter();
  const [form, setForm] = useState<Form>(EMPTY);
  const [saved, setSaved] = useState<Form>(EMPTY);
  const [slug, setSlug] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    getFleetDetailsAction().then((res) => {
      if (cancelled) return;
      if (res.details) {
        const f = toForm(res.details);
        setForm(f);
        setSaved(f);
        setSlug(res.details.slug);
      } else if (res.error) {
        setError(res.error);
      }
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const dirty = JSON.stringify(form) !== JSON.stringify(saved);

  const onSave = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    startTransition(async () => {
      const res = await updateFleetDetailsAction(form);
      if (res.error) { setError(res.error); return; }
      setSaved(form);
      setNotice('Fleet details saved.');
      setTimeout(() => setNotice(''), 3500);
      router.refresh();
    });
  };

  if (loading) return null;

  return (
    <form className={styles.brandSection} onSubmit={onSave}>
      <h2 className={styles.sectionTitle}>Fleet details</h2>
      <p className={styles.sectionSub}>
        Your fleet’s name and business details. The name appears across the dashboard and the driver app;
        the business details print on settlement PDFs.
      </p>

      {error && <div className={`${styles.message} ${styles.error}`}>{error}</div>}
      {notice && <div className={`${styles.message} ${styles.success}`}>{notice}</div>}

      <div className={styles.brandCard}>
        <div className={styles.brandCardHead}>
          <div className={styles.settingLabel}>Name</div>
          <div className={styles.settingDescription}>How your fleet is called in Rovora. Sign-in address stays <span className="mono">{slug}</span>.</div>
        </div>
        <div className={styles.fieldGrid}>
          <label className={styles.field}>
            <span>Fleet name</span>
            <input value={form.name} onChange={set('name')} maxLength={80} required placeholder="e.g. Harbour Cabs" />
          </label>
          <label className={styles.field}>
            <span>Legal / registered name <em>optional</em></span>
            <input value={form.legal_name} onChange={set('legal_name')} maxLength={160} placeholder="e.g. Harbour Cabs Ltd" />
          </label>
          <label className={styles.field}>
            <span>VAT number <em>optional</em></span>
            <input value={form.vat_number} onChange={set('vat_number')} maxLength={40} placeholder="e.g. MT12345678" />
          </label>
        </div>
      </div>

      <div className={styles.brandCard}>
        <div className={styles.brandCardHead}>
          <div className={styles.settingLabel}>Contact</div>
          <div className={styles.settingDescription}>Shown to your drivers as the fleet office, and used on documents.</div>
        </div>
        <div className={styles.fieldGrid}>
          <label className={styles.field}>
            <span>Office email</span>
            <input type="email" value={form.contact_email} onChange={set('contact_email')} maxLength={120} placeholder="office@yourfleet.com" />
          </label>
          <label className={styles.field}>
            <span>Office phone</span>
            <input type="tel" value={form.contact_phone} onChange={set('contact_phone')} maxLength={40} placeholder="+356 2100 0000" />
          </label>
          <label className={styles.field}>
            <span>Website <em>optional</em></span>
            <input value={form.website} onChange={set('website')} maxLength={200} placeholder="www.yourfleet.com" />
          </label>
          <label className={`${styles.field} ${styles.fieldWide}`}>
            <span>Address</span>
            <textarea value={form.address} onChange={set('address')} maxLength={400} rows={2} placeholder="Street, town, postcode" />
          </label>
        </div>
      </div>

      <div className={styles.brandCard}>
        <div className={styles.brandCardHead}>
          <div className={styles.settingLabel}>Driving</div>
          <div className={styles.settingDescription}>Speed above which a live-tracking alert fires and a speeding event counts against a driver’s safety score. Leave empty to turn speeding alerts off.</div>
        </div>
        <div className={styles.fieldGrid}>
          <label className={styles.field}>
            <span>Fleet speed limit (km/h)</span>
            <input type="number" inputMode="numeric" min={20} max={200} step={1} value={form.speed_limit_kmh} onChange={set('speed_limit_kmh')} placeholder="e.g. 80" />
          </label>
        </div>
      </div>

      <div className={styles.formActions}>
        <button type="button" className="btn btn-secondary" disabled={!dirty || isPending} onClick={() => { setForm(saved); setError(''); }}>
          Discard changes
        </button>
        <button type="submit" className="btn btn-primary" disabled={!dirty || isPending}>
          {isPending ? 'Saving…' : 'Save fleet details'}
        </button>
      </div>
    </form>
  );
}
