'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { trackEvent } from '@/lib/analytics/client';
import LiteYouTube from '../LiteYouTube';
import { Icon } from '../feature/icons';
import { START_TRIAL } from '../links';

export type WalkthroughVideo =
  | { kind: 'file'; mp4: string; webm?: string; poster?: string }
  | { kind: 'youtube'; id: string };

const TITLE = 'Rovora product walkthrough';

/**
 * Hero "Watch the walkthrough" button and the modal it opens. The player is
 * only mounted while the modal is open, so nothing loads on first paint and
 * closing the modal stops playback.
 */
export default function WalkthroughButton({ video }: { video: WalkthroughVideo }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);

  const show = () => {
    setOpen(true);
    dialog.current?.showModal();
    trackEvent('Walkthrough opened', { label: TITLE });
  };
  const hide = () => dialog.current?.close();

  return (
    <>
      <button type="button" className="watch-btn" onClick={show}>
        <span className="watch-ico" aria-hidden="true"><Icon.play /></span>
        Watch the walkthrough
      </button>

      <dialog
        ref={dialog}
        className="video-modal"
        aria-labelledby="walkthrough-title"
        onClose={() => setOpen(false)}
        // A click on the dialog box itself (not its contents) is the backdrop.
        onClick={(e) => { if (e.target === e.currentTarget) hide(); }}
      >
        <div className="vm-inner">
          <div className="vm-head">
            <h2 id="walkthrough-title">See Rovora in action</h2>
            <button type="button" className="vm-x" onClick={hide} aria-label="Close walkthrough">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
            </button>
          </div>
          <div className="vm-video">
            {open && (video.kind === 'file' ? (
              <video controls autoPlay playsInline poster={video.poster} aria-label={TITLE}>
                {video.webm && <source src={video.webm} type="video/webm" />}
                <source src={video.mp4} type="video/mp4" />
              </video>
            ) : (
              <LiteYouTube id={video.id} title={TITLE} />
            ))}
          </div>
          <div className="vm-foot">
            <span>{TITLE}</span>
            <Link className="btn btn-primary" href={START_TRIAL}>Try it with your fleet</Link>
          </div>
        </div>
      </dialog>
    </>
  );
}
