'use client';

import { useState } from 'react';

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
 */
export default function LiteYouTube({
  id,
  title,
  priority = false,
}: {
  id: string;
  title: string;
  priority?: boolean;
}) {
  const [playing, setPlaying] = useState(false);

  if (playing) {
    return (
      <div className="ytlite">
        <iframe
          className="ytlite-frame"
          src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`}
          title={title}
          loading="lazy"
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
