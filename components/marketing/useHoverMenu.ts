'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Open/close behaviour shared by the nav mega-menus: opens on hover (desktop)
 * or click (touch / keyboard), closes on Escape, an outside click, or a short
 * delay after the pointer leaves — so moving onto the panel doesn't close it.
 */
export function useHoverMenu() {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const cancelClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  };
  const scheduleClose = () => {
    cancelClose();
    closeTimer.current = setTimeout(() => setOpen(false), 120);
  };

  return {
    open,
    wrapRef,
    close: () => setOpen(false),
    toggle: () => setOpen((o) => !o),
    wrapProps: {
      onMouseEnter: () => {
        cancelClose();
        setOpen(true);
      },
      onMouseLeave: scheduleClose,
    },
  };
}
