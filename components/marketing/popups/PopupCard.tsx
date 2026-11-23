'use client';

import Link from 'next/link';
import type { MouseEvent, Ref } from 'react';
import type { PublicPopup } from '@/lib/popups/types';
import styles from './SitePopups.module.css';

export type PopupCloseReason = 'close' | 'dismiss' | 'backdrop' | 'escape';

interface Props {
  popup: Pick<PublicPopup, 'name' | 'layout' | 'tag' | 'title' | 'body' | 'imageUrl' | 'ctaLabel' | 'ctaUrl' | 'dismissLabel'>;
  /** Live on the website: adds the stable ids the heatmap anchors on. */
  live?: boolean;
  onClose?: (reason: PopupCloseReason) => void;
  onCta?: (e: MouseEvent<HTMLAnchorElement>) => void;
  cardRef?: Ref<HTMLDivElement>;
  /** Modal only: the dialog's accessible role lives on the card. */
  modal?: boolean;
}

/**
 * The pop-up's card: optional image, tag, title, text, button and "No
 * thanks". Shared by the website (SitePopups) and the admin preview, so what
 * the admin sees is what visitors get.
 *
 * On the website every part carries a fixed id (`rv-popup-cta`, …) so the
 * click heatmap can find it again and place clicks on the pop-up itself.
 */
export default function PopupCard({ popup, live = false, onClose, onCta, cardRef, modal = false }: Props) {
  const id = (part: string) => (live ? `rv-popup-${part}` : undefined);
  const internal = !!popup.ctaUrl && popup.ctaUrl.startsWith('/');
  const external = !!popup.ctaUrl && /^https?:/i.test(popup.ctaUrl);
  const ctaProps = {
    id: id('cta'),
    className: styles.cta,
    onClick: onCta,
    'data-track': live ? 'Popup click' : undefined,
    'data-track-label': live ? `${popup.name} · ${popup.ctaLabel ?? ''}`.slice(0, 120) : undefined,
  };
  const arrow = (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M6 3.5 10.5 8 6 12.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );

  return (
    <div
      id={id('card')}
      ref={cardRef}
      className={`${styles.card} ${popup.imageUrl ? styles.hasImage : ''}`}
      role={live ? 'dialog' : undefined}
      aria-modal={live ? modal : undefined}
      aria-labelledby={live ? 'rv-popup-title' : undefined}
      aria-describedby={live && popup.body ? 'rv-popup-text' : undefined}
      tabIndex={live ? -1 : undefined}
    >
      <button id={id('close')} type="button" className={styles.close} aria-label="Close" onClick={() => onClose?.('close')}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
      {popup.imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- admin-uploaded image on any host
        <img id={id('image')} className={styles.image} src={popup.imageUrl} alt="" />
      )}
      <div className={styles.content}>
        {popup.tag && <span className={styles.tag}>{popup.tag}</span>}
        <h2 id={id('title')} className={styles.title}>{popup.title || 'Your headline'}</h2>
        {popup.body && <p id={id('text')} className={styles.text}>{popup.body}</p>}
        {(popup.ctaLabel || popup.dismissLabel) && (
          <div className={styles.actions}>
            {popup.ctaLabel && popup.ctaUrl && (
              internal ? (
                <Link href={popup.ctaUrl} {...ctaProps}>{popup.ctaLabel}{arrow}</Link>
              ) : (
                <a href={popup.ctaUrl} {...ctaProps} {...(external ? { target: '_blank', rel: 'noopener' } : {})}>
                  {popup.ctaLabel}{arrow}
                </a>
              )
            )}
            {popup.dismissLabel && (
              <button id={id('dismiss')} type="button" className={styles.dismiss} onClick={() => onClose?.('dismiss')}>
                {popup.dismissLabel}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
