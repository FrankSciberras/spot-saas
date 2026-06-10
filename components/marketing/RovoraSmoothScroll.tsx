'use client';

import { useEffect } from 'react';

/**
 * Eased in-page anchor scrolling for the marketing site.
 *
 * Native `scroll-behavior: smooth` only animates when it's set on the actual
 * scrolling element — which, now that `.rovora-site` no longer establishes its
 * own scroll container, is the document root. Rather than flip a global rule
 * on `html` (which would leak into the app), we intercept clicks on in-page
 * `#` links and run a custom eased scroll that always lands the target just
 * below the 64px sticky nav.
 */
const NAV_OFFSET = 84; // keep in sync with `.rovora-site [id] { scroll-margin-top }`
const DURATION = 620; // ms

const easeInOutCubic = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

export default function RovoraSmoothScroll() {
  useEffect(() => {
    const prefersReduced = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches;

    function smoothTo(targetY: number, onDone?: () => void) {
      const startY = window.scrollY;
      const delta = targetY - startY;
      if (prefersReduced || Math.abs(delta) < 2) {
        window.scrollTo(0, targetY);
        onDone?.();
        return;
      }
      const start = performance.now();
      function frame(now: number) {
        const elapsed = now - start;
        const t = Math.min(1, elapsed / DURATION);
        window.scrollTo(0, startY + delta * easeInOutCubic(t));
        if (t < 1) {
          requestAnimationFrame(frame);
        } else {
          onDone?.();
        }
      }
      requestAnimationFrame(frame);
    }

    function onClick(e: MouseEvent) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
        return;
      }
      const link = (e.target as HTMLElement | null)?.closest('a');
      if (!link) return;
      const href = link.getAttribute('href');
      if (!href || !href.startsWith('#') || href === '#') return;

      const id = decodeURIComponent(href.slice(1));
      const target = document.getElementById(id);
      if (!target) return;

      e.preventDefault();
      const top = target.getBoundingClientRect().top + window.scrollY - NAV_OFFSET;
      smoothTo(Math.max(0, top), () => {
        // Update the URL hash without triggering another jump.
        history.pushState(null, '', href);
      });
    }

    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, []);

  return null;
}
