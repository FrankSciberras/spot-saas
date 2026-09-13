'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Testimonial } from './testimonials';

const AUTO_MS = 7000;

function Stars({ value }: { value: number }) {
  return (
    <span className="tst-stars" aria-label={`${value} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((i) => {
        const fill = Math.max(0, Math.min(1, value - (i - 1))); // 0, 0.5 or 1
        return (
          <span key={i} className="tst-star" aria-hidden="true">
            <svg viewBox="0 0 24 24"><path d="M12 2.6l2.9 6.1 6.7.8-4.9 4.6 1.3 6.6L12 17.4l-6 3.3 1.3-6.6L2.4 9.5l6.7-.8L12 2.6z" fill="var(--line-3)" /></svg>
            <span className="tst-star-fill" style={{ width: `${fill * 100}%` }}>
              <svg viewBox="0 0 24 24"><path d="M12 2.6l2.9 6.1 6.7.8-4.9 4.6 1.3 6.6L12 17.4l-6 3.3 1.3-6.6L2.4 9.5l6.7-.8L12 2.6z" fill="#f5a623" /></svg>
            </span>
          </span>
        );
      })}
      <span className="tst-stars-num">{value.toFixed(1)}</span>
    </span>
  );
}

/**
 * Testimonials slider: one quote at a time, arrows + dots, auto-advances every
 * 7s and pauses while hovered/focused or when the OS asks for reduced motion.
 */
export default function TestimonialsCarousel({ items }: { items: Testimonial[] }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const reduced = useRef(false);

  useEffect(() => {
    reduced.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);

  const go = useCallback((n: number) => setIndex((i) => (i + n + items.length) % items.length), [items.length]);

  useEffect(() => {
    if (paused || reduced.current || items.length < 2) return;
    const t = setInterval(() => go(1), AUTO_MS);
    return () => clearInterval(t);
  }, [paused, go, items.length]);

  if (items.length === 0) return null;
  const t = items[index];

  return (
    <div
      className="tst"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <figure className="tst-card" key={index} aria-live="polite">
        <Stars value={t.stars} />
        <blockquote className="tst-quote">“{t.quote}”</blockquote>
        <figcaption className="tst-who">
          <span className="tst-avatar" aria-hidden="true">{t.name.trim().charAt(0).toUpperCase()}</span>
          <span>
            <strong>{t.name}</strong>
            <span className="tst-role">{t.role}</span>
          </span>
        </figcaption>
      </figure>

      {items.length > 1 && (
        <div className="tst-nav">
          <button type="button" className="tst-arrow" onClick={() => go(-1)} aria-label="Previous testimonial">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 6l-6 6 6 6" /></svg>
          </button>
          <div className="tst-dots" role="tablist" aria-label="Testimonials">
            {items.map((_, i) => (
              <button
                key={i}
                type="button"
                role="tab"
                aria-selected={i === index}
                aria-label={`Testimonial ${i + 1} of ${items.length}`}
                className={`tst-dot${i === index ? ' on' : ''}`}
                onClick={() => setIndex(i)}
              />
            ))}
          </div>
          <button type="button" className="tst-arrow" onClick={() => go(1)} aria-label="Next testimonial">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>
          </button>
        </div>
      )}
    </div>
  );
}
