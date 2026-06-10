'use client';

import { useState, useRef, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useBranding } from '@/components/shared/BrandingProvider';
import {
  updateBrandColorAction,
  uploadLogoAction,
  removeLogoAction,
} from '@/lib/actions/branding';
import styles from './settings.module.css';

const DEFAULT_COLOR = '#14784a';

export default function BrandingSettings() {
  const branding = useBranding();
  const router = useRouter();

  const [logoUrl, setLogoUrl] = useState<string | null>(branding.logoUrl);
  const [color, setColor] = useState<string>(branding.brandColor ?? DEFAULT_COLOR);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [isPending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  const flash = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice(''), 3500);
  };

  const onUpload = (file: File) => {
    setError('');
    const data = new FormData();
    data.set('logo', file);
    startTransition(async () => {
      const result = await uploadLogoAction(data);
      if (result.error) {
        setError(result.error);
        return;
      }
      setLogoUrl(result.logoUrl ?? null);
      flash('Logo updated.');
      router.refresh();
    });
  };

  const onRemoveLogo = () => {
    setError('');
    startTransition(async () => {
      const result = await removeLogoAction();
      if (result.error) {
        setError(result.error);
        return;
      }
      setLogoUrl(null);
      if (fileRef.current) fileRef.current.value = '';
      flash('Logo removed.');
      router.refresh();
    });
  };

  const onSaveColor = () => {
    setError('');
    startTransition(async () => {
      const result = await updateBrandColorAction(color);
      if (result.error) {
        setError(result.error);
        return;
      }
      flash('Brand colour saved.');
      router.refresh();
    });
  };

  return (
    <div className={styles.brandSection}>
      <h2 className={styles.sectionTitle}>Branding</h2>
      <p className={styles.sectionSub}>
        Customise how your dashboard looks for you and your drivers.
      </p>

      {error && <div className={`${styles.message} ${styles.error}`}>{error}</div>}
      {notice && <div className={`${styles.message} ${styles.success}`}>{notice}</div>}

      {/* Logo --------------------------------------------------------------- */}
      <div className={styles.brandCard}>
        <div className={styles.brandCardHead}>
          <div className={styles.settingLabel}>Logo</div>
          <div className={styles.settingDescription}>
            Shown at the top-left of every page. PNG, JPG, WebP or SVG, up to 2 MB.
          </div>
        </div>

        <div className={styles.logoRow}>
          <div className={styles.logoPreview}>
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="Current logo" className={styles.logoPreviewImg} />
            ) : (
              <span className={styles.logoPreviewEmpty}>No logo — using the default</span>
            )}
          </div>

          <div className={styles.logoActions}>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              className={styles.hiddenFile}
              disabled={isPending}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onUpload(f);
              }}
            />
            <button
              type="button"
              className="btn btn-primary"
              disabled={isPending}
              onClick={() => fileRef.current?.click()}
            >
              {isPending ? 'Working…' : logoUrl ? 'Replace logo' : 'Upload logo'}
            </button>
            {logoUrl && (
              <button
                type="button"
                className="btn btn-secondary"
                disabled={isPending}
                onClick={onRemoveLogo}
              >
                Remove
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Colour ------------------------------------------------------------- */}
      <div className={styles.brandCard}>
        <div className={styles.brandCardHead}>
          <div className={styles.settingLabel}>Brand colour</div>
          <div className={styles.settingDescription}>
            Used for buttons, links and highlights across the dashboard.
          </div>
        </div>

        <div className={styles.colorRow}>
          <input
            type="color"
            className={styles.colorSwatch}
            value={color}
            disabled={isPending}
            onChange={(e) => setColor(e.target.value)}
            aria-label="Brand colour picker"
          />
          <input
            type="text"
            className={styles.colorHex}
            value={color}
            disabled={isPending}
            onChange={(e) => setColor(e.target.value)}
            placeholder="#1a8f5a"
            maxLength={7}
          />
          <button
            type="button"
            className="btn btn-primary"
            disabled={isPending}
            onClick={onSaveColor}
          >
            Save colour
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={isPending}
            onClick={() => {
              setColor(DEFAULT_COLOR);
              startTransition(async () => {
                const result = await updateBrandColorAction(null);
                if (result.error) setError(result.error);
                else { flash('Reset to the default colour.'); router.refresh(); }
              });
            }}
          >
            Reset
          </button>
        </div>
      </div>
    </div>
  );
}
