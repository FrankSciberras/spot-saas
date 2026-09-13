'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';

// SSR-safe live read of the OS "reduce motion" preference.
function useReducedMotion(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
      mq.addEventListener('change', onChange);
      return () => mq.removeEventListener('change', onChange);
    },
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    () => false,
  );
}

/**
 * Self-hosted hero video — the ambient, muted, looping product demo.
 *
 * Why not the YouTube embed: YouTube's player chooses its own resolution for
 * muted autoplay embeds and routinely settles on 360p/480p regardless of the
 * upload, and the quality parameters that used to force HD are ignored now.
 * Serving our own file means the browser plays exactly the encode we ship.
 *
 * Files (see public/videos/README.md):
 *   /videos/hero.webm   preferred (smaller), optional
 *   /videos/hero.mp4    H.264 fallback, required
 *   /videos/hero.jpg    poster, shown before the first frame and for
 *                       reduced-motion visitors
 *
 * Accessibility: a small pause/play toggle sits in the corner so the motion
 * can be stopped (WCAG 2.2.2). Reduced-motion visitors get the poster with a
 * play button instead of autoplay.
 */
export default function HeroVideo({ title }: { title: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const reducedMotion = useReducedMotion();
  const [paused, setPaused] = useState(false);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    const v = ref.current;
    if (!v || reducedMotion) return;
    // Some browsers refuse autoplay until the element is scripted; nudge it.
    v.play().catch(() => setPaused(true));
  }, [reducedMotion]);

  const toggle = () => {
    const v = ref.current;
    if (!v) return;
    if (v.paused) {
      v.play().then(() => { setPaused(false); setStarted(true); }).catch(() => undefined);
    } else {
      v.pause();
      setPaused(true);
    }
  };

  const autoplay = !reducedMotion;
  const showPoster = reducedMotion && !started;

  return (
    <div className="herovid">
      <video
        ref={ref}
        className="herovid-el"
        poster="/videos/hero.jpg"
        muted
        loop
        playsInline
        autoPlay={autoplay}
        preload={autoplay ? 'auto' : 'metadata'}
        aria-label={title}
        onPlay={() => { setPaused(false); setStarted(true); }}
        onPause={() => setPaused(true)}
      >
        <source src="/videos/hero.webm" type="video/webm" />
        <source src="/videos/hero.mp4" type="video/mp4" />
      </video>

      {showPoster ? (
        <button type="button" className="herovid-play" onClick={toggle} aria-label={`Play video: ${title}`}>
          <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true"><path d="M8 5v14l11-7z" fill="currentColor" /></svg>
        </button>
      ) : (
        <button
          type="button"
          className="herovid-toggle"
          onClick={toggle}
          aria-label={paused ? 'Play video' : 'Pause video'}
          aria-pressed={paused}
        >
          {paused ? (
            <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M8 5v14l11-7z" fill="currentColor" /></svg>
          ) : (
            <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M7 5h4v14H7zM13 5h4v14h-4z" fill="currentColor" /></svg>
          )}
        </button>
      )}
    </div>
  );
}
