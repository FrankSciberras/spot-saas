'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { START_TRIAL } from '../links';
import { useNavViewer } from '../useNavViewer';

/**
 * Phone-only bar pinned to the bottom of the homepage: "Start my free trial ·
 * No card required". It appears once the hero's own buttons have scrolled
 * away, and never for someone who is already signed in.
 */
export default function MobileTrialBar() {
  const viewer = useNavViewer();
  const [show, setShow] = useState(false);

  useEffect(() => {
    const hero = document.querySelector('.home-hero .hero-actions');
    if (!hero || !('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver(([entry]) => setShow(!entry.isIntersecting && entry.boundingClientRect.top < 0));
    io.observe(hero);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    document.body.classList.toggle('trial-bar-on', show && !viewer);
    return () => document.body.classList.remove('trial-bar-on');
  }, [show, viewer]);

  if (viewer) return null;
  return (
    <div className="mobile-trial" data-show={show || undefined} aria-hidden={!show || undefined}>
      <Link className="btn btn-primary" href={START_TRIAL} tabIndex={show ? undefined : -1}>Start my free trial</Link>
      <span>No card required</span>
    </div>
  );
}
