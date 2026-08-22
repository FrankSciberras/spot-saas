'use client';

import { useState, useSyncExternalStore } from 'react';

// Live subscription to the OS "reduce motion" setting, SSR-safe (the server
// snapshot says false, so the server always renders the autoplay branch and the
// client corrects itself at hydration for the few users who opt out).
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
 * Lightweight, click-to-play YouTube embed. Until the user clicks, it renders
 * only the poster thumbnail + a play button (basically weightless), so the heavy
 * YouTube player never loads on first paint. On click it swaps in the real
 * privacy-friendly (youtube-nocookie) iframe and autoplays.
 *
 * `priority` is for an embed that sits ABOVE THE FOLD (the home page hero). The
 * poster is then the page's largest paint, and lazy-loading it means the browser
 * waits for layout before even requesting it — measurably worse LCP. Leave it off
 * anywhere further down the page.
 *
 * `autoplay` skips the poster entirely: the video starts MUTED and LOOPS, like a
 * living product screenshot (browsers only permit autoplay when muted, and loop
 * on YouTube needs `playlist=` set to the same id). It is fully AMBIENT: player
 * controls are off and pointer events never reach the iframe, so it cannot be
 * paused, scrubbed — or unmuted. Purely decorative, like a background video.
 * This loads the full player on first paint — a deliberate trade of page weight
 * for a hero that's already moving. Users with reduced-motion set get the
 * click-to-play poster instead.
 */
export default function LiteYouTube({
  id,
  title,
  priority = false,
  autoplay = false,
}: {
  id: string;
  title: string;
  priority?: boolean;
  autoplay?: boolean;
}) {
  const [playing, setPlaying] = useState(false);
  const reducedMotion = useReducedMotion();

  if (playing || (autoplay && !reducedMotion)) {
    // A manual click means the visitor chose to watch — start with sound and
    // full controls, no loop. The ambient autoplay is chrome-free: controls=0
    // drops the control bar, disablekb/fs close the remaining interaction
    // routes, iv_load_policy=3 hides annotations. The load-time title card and
    // mute pill (which controls=0 does NOT remove) are cropped away by the
    // .ytlite-ambient letterbox trick in the stylesheet.
    const ambient = !playing;
    const params = ambient
      ? `autoplay=1&mute=1&loop=1&playlist=${id}&playsinline=1&controls=0&disablekb=1&fs=0&iv_load_policy=3&rel=0`
      : 'autoplay=1&rel=0';
    return (
      <div className={ambient ? 'ytlite ytlite-ambient' : 'ytlite'}>
        <iframe
          className="ytlite-frame"
          src={`https://www.youtube-nocookie.com/embed/${id}?${params}`}
          title={title}
          loading={ambient ? 'eager' : 'lazy'}
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
        />
      </div>
    );
  }

  return (
    <button
      type="button"
      className="ytlite ytlite-poster"
      onClick={() => setPlaying(true)}
      aria-label={`Play video: ${title}`}
    >
      <img
        className="ytlite-thumb"
        src={`https://i.ytimg.com/vi/${id}/maxresdefault.jpg`}
        alt=""
        loading={priority ? 'eager' : 'lazy'}
        fetchPriority={priority ? 'high' : 'auto'}
        onError={(e) => {
          // maxresdefault doesn't exist for every upload — fall back to hqdefault.
          e.currentTarget.src = `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
        }}
      />
      <span className="ytlite-play" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="28" height="28"><path d="M8 5v14l11-7z" fill="currentColor" /></svg>
      </span>
    </button>
  );
}
