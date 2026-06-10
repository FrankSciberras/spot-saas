'use client';

import { useEffect } from 'react';

/**
 * Drives the landing-page entrance animations.
 *
 * Markup opts in with two classes (defined in rovora-site.css):
 *   .reveal          – the element fades/rises in once, when it scrolls into view
 *   .reveal-stagger  – same, but its direct children are revealed in sequence
 *
 * Everything is progressive: with JS off, or `prefers-reduced-motion`, the
 * content is shown immediately and nothing here runs.
 */
export default function RovoraReveal() {
  useEffect(() => {
    const root = document.querySelector('.rovora-site');
    if (!root) return;

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Stagger children of any .reveal-stagger container before observing.
    root.querySelectorAll<HTMLElement>('.reveal-stagger').forEach((group) => {
      Array.from(group.children).forEach((child, i) => {
        const el = child as HTMLElement;
        el.classList.add('reveal');
        el.style.setProperty('--rd', `${i * 70}ms`);
      });
    });

    const targets = root.querySelectorAll<HTMLElement>('.reveal');

    if (reduce || !('IntersectionObserver' in window)) {
      targets.forEach((el) => el.classList.add('is-in'));
      return;
    }

    const io = new IntersectionObserver(
      (entries, obs) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-in');
            obs.unobserve(entry.target);
          }
        }
      },
      { rootMargin: '0px 0px -10% 0px', threshold: 0.12 }
    );

    targets.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  return null;
}
