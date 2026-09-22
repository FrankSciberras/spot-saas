'use client';

import { useEffect, useState } from 'react';
import { DOC_SECTIONS } from '@/lib/api/docs';
import styles from './docs.module.css';

interface NavEntry {
  id: string;
  label: string;
  children?: { id: string; label: string; method: string }[];
}

const GUIDE_ENTRIES: NavEntry[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'quickstart', label: 'Quickstart' },
  { id: 'authentication', label: 'Authentication' },
  { id: 'rate-limits', label: 'Rate limits' },
  { id: 'conventions', label: 'Requests & responses' },
  { id: 'errors', label: 'Errors' },
];

const REFERENCE_ENTRIES: NavEntry[] = DOC_SECTIONS.map((s) => ({
  id: s.id,
  label: s.title,
  children: s.endpoints.map((e) => ({ id: e.id, label: e.summary, method: e.method })),
}));

const TAIL_ENTRIES: NavEntry[] = [
  { id: 'security', label: 'Keeping keys safe' },
  { id: 'versioning', label: 'Versioning' },
];

const ALL_IDS = [
  ...GUIDE_ENTRIES.map((e) => e.id),
  ...REFERENCE_ENTRIES.flatMap((e) => [e.id, ...(e.children ?? []).map((c) => c.id)]),
  ...TAIL_ENTRIES.map((e) => e.id),
];

/**
 * The docs sidebar, with the usual scroll-spy highlight so you can always see
 * where you are in a long reference page. Falls back to a plain anchor list
 * when IntersectionObserver isn't available.
 */
export default function DocsNav() {
  const [active, setActive] = useState<string>('overview');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      (entries) => {
        // The topmost heading currently inside the reading band wins.
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]?.target.id) setActive(visible[0].target.id);
      },
      // Band sits just under the sticky nav and covers the upper half of the
      // viewport, so a heading "activates" as it reaches reading position.
      { rootMargin: '-80px 0px -55% 0px', threshold: 0 },
    );

    for (const id of ALL_IDS) {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, []);

  const link = (id: string, label: string, method?: string) => (
    <a
      key={id}
      href={`#${id}`}
      className={`${method ? styles.navChild : styles.navLink} ${active === id ? styles.navActive : ''}`}
      onClick={() => setOpen(false)}
    >
      {method && <span className={styles[`m_${method}`]}>{method}</span>}
      {label}
    </a>
  );

  return (
    <nav className={`${styles.sidebar} ${open ? styles.sidebarOpen : ''}`} aria-label="API documentation">
      <button
        className={styles.sidebarToggle}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        {open ? 'Hide contents' : 'Contents'}
      </button>

      <div className={styles.sidebarInner}>
        <div className={styles.navGroup}>
          <div className={styles.navGroupLabel}>Getting started</div>
          {GUIDE_ENTRIES.map((e) => link(e.id, e.label))}
        </div>

        <div className={styles.navGroup}>
          <div className={styles.navGroupLabel}>Reference</div>
          {REFERENCE_ENTRIES.map((e) => (
            <div key={e.id}>
              {link(e.id, e.label)}
              <div className={styles.navChildren}>
                {(e.children ?? []).map((c) => link(c.id, c.label, c.method))}
              </div>
            </div>
          ))}
        </div>

        <div className={styles.navGroup}>
          <div className={styles.navGroupLabel}>More</div>
          {TAIL_ENTRIES.map((e) => link(e.id, e.label))}
        </div>
      </div>
    </nav>
  );
}
