'use client';

import { useEffect, useState } from 'react';
import type { NavViewer } from '@/lib/auth/viewer';

/**
 * The desktop nav actions and the mobile menu both need to know who's signed in,
 * and they mount together — so share the request rather than firing two.
 *
 * Only the *in-flight* promise is cached: once it settles the slot is cleared, so
 * a later navigation re-checks instead of showing a stale signed-out nav to
 * someone who just logged in.
 */
let inflight: Promise<NavViewer | null> | null = null;

function loadViewer(): Promise<NavViewer | null> {
  if (!inflight) {
    inflight = fetch('/api/nav-viewer')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => (data?.viewer ?? null) as NavViewer | null)
      // Signed-out is the correct fallback for any failure here.
      .catch(() => null)
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

/** The signed-in viewer, or null while loading / when signed out. */
export function useNavViewer(): NavViewer | null {
  const [viewer, setViewer] = useState<NavViewer | null>(null);

  useEffect(() => {
    let alive = true;
    loadViewer().then((v) => {
      if (alive) setViewer(v);
    });
    return () => {
      alive = false;
    };
  }, []);

  return viewer;
}
