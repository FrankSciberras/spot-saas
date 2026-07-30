'use client';

import type { CSSProperties } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import type { SessionUser } from '@/lib/types/database';
import FleetIcon from './FleetIcon';
import { useFleetTheme } from './FleetThemeRoot';
import { useEnabledModules } from './FleetModulesProvider';
import { canSeeNavItem, DRIVER_NAV_GROUPS, NAV_GROUPS, type NavItem } from './navConfig';

interface FleetCommandPaletteProps {
  user: SessionUser;
  variant?: 'fleet' | 'driver';
}

interface Hit {
  id: string;
  kind: 'driver' | 'vehicle';
  label: string;
  sub: string | null;
  href: string;
}

interface Row {
  key: string;
  label: string;
  sub: string | null;
  icon: string;
  href: string;
  section: string;
}

/**
 * ⌘K / Ctrl+K command palette.
 *
 * Opens from the keyboard anywhere in the shell, or by clicking the topbar
 * search box (which dispatches `rovora:open-search`). Jumps to any page the
 * user can actually see, and looks up drivers and vehicles via /api/search.
 */
export default function FleetCommandPalette({ user, variant = 'fleet' }: FleetCommandPaletteProps) {
  const router = useRouter();
  const { theme } = useFleetTheme();
  const enabledModules = useEnabledModules();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<Hit[]>([]);
  const [cursor, setCursor] = useState(0);
  const [searching, setSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const isDriver = variant === 'driver';

  useEffect(() => setMounted(true), []);

  // Pages this user can reach, flattened from the same nav config the sidebar uses.
  const pages: NavItem[] = useMemo(() => {
    const groups = isDriver ? DRIVER_NAV_GROUPS : NAV_GROUPS;
    return groups.flatMap((g) =>
      g.items.filter((item) =>
        canSeeNavItem(item, {
          role: user?.role,
          alsoStaff: user?.also_staff,
          enabledModules,
          isDriver,
        }),
      ),
    );
  }, [isDriver, user?.role, user?.also_staff, enabledModules]);

  const close = useCallback(() => {
    setOpen(false);
    setQ('');
    setHits([]);
    setCursor(0);
  }, []);

  // Global hotkey + the topbar search box.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
        return;
      }
      // Fallback for when focus has left the input (e.g. after a mouse click).
      if (e.key === 'Escape') setOpen(false);
    };
    const onOpen = () => setOpen(true);
    document.addEventListener('keydown', onKey);
    window.addEventListener('rovora:open-search', onOpen);
    return () => {
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('rovora:open-search', onOpen);
    };
  }, []);

  useEffect(() => {
    if (open) {
      // Focus after the portal paints.
      const t = setTimeout(() => inputRef.current?.focus(), 0);
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        clearTimeout(t);
        document.body.style.overflow = prev;
      };
    }
  }, [open]);

  // Debounced record lookup. Fleet only — there is no driver-side search API.
  useEffect(() => {
    if (!open || isDriver) return;
    const term = q.trim();
    if (term.length < 2) {
      setHits([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(term)}`, { signal: ctrl.signal });
        if (res.ok) {
          const data = await res.json();
          setHits(data.data || []);
        }
      } catch {
        // Aborted or offline — leave the previous hits alone.
      } finally {
        setSearching(false);
      }
    }, 200);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q, open, isDriver]);

  const rows: Row[] = useMemo(() => {
    const term = q.trim().toLowerCase();
    const pageRows: Row[] = pages
      .filter((p) => !term || p.name.toLowerCase().includes(term))
      .map((p) => ({ key: `page-${p.id}`, label: p.name, sub: null, icon: p.icon, href: p.href, section: 'Go to' }));

    const hitRows: Row[] = hits.map((h) => ({
      key: `${h.kind}-${h.id}`,
      label: h.label,
      sub: h.sub,
      icon: h.kind === 'driver' ? 'driver' : 'vehicle',
      href: h.href,
      section: h.kind === 'driver' ? 'Drivers' : 'Vehicles',
    }));

    return [...pageRows, ...hitRows];
  }, [pages, hits, q]);

  // Keep the cursor inside the list as results change.
  useEffect(() => { setCursor(0); }, [q]);
  useEffect(() => {
    if (cursor > rows.length - 1) setCursor(Math.max(0, rows.length - 1));
  }, [rows.length, cursor]);

  const pick = useCallback((row: Row | undefined) => {
    if (!row) return;
    close();
    router.push(row.href);
  }, [close, router]);

  const onInputKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setCursor((c) => Math.min(c + 1, rows.length - 1)); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); setCursor((c) => Math.max(c - 1, 0)); return; }
    if (e.key === 'Enter') { e.preventDefault(); pick(rows[cursor]); }
  };

  // Scroll the highlighted row into view when arrowing past the fold.
  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.querySelector<HTMLElement>('[data-active="true"]');
    el?.scrollIntoView({ block: 'nearest' });
  }, [cursor, open]);

  if (!mounted || !open) return null;

  let lastSection = '';

  return createPortal(
    // Portalled to <body>, outside the .fleetTheme wrapper — re-apply it here
    // or none of the design tokens resolve.
    <div
      style={st.scrim}
      className="fleetModalOverlay fleetTheme"
      data-fleet-theme={theme}
      onMouseDown={close}
      role="presentation"
    >
      <div
        style={st.panel}
        className="fleetModalCard"
        role="dialog"
        aria-modal="true"
        aria-label="Search and jump to"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div style={st.inputRow}>
          <FleetIcon name="search" size={17} />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onInputKey}
            placeholder={isDriver ? 'Jump to a page…' : 'Search drivers, plates, or jump to a page…'}
            style={st.input}
            aria-label="Search"
            autoComplete="off"
            spellCheck={false}
          />
          <kbd style={st.kbd}>esc</kbd>
        </div>

        <div style={st.list} ref={listRef}>
          {rows.length === 0 ? (
            <div style={st.empty}>
              {searching ? 'Searching…' : q.trim() ? `Nothing matches “${q.trim()}”` : 'Start typing to search'}
            </div>
          ) : (
            rows.map((row, i) => {
              const header = row.section !== lastSection ? row.section : null;
              lastSection = row.section;
              const active = i === cursor;
              return (
                <div key={row.key}>
                  {header && <div style={st.sectionLabel}>{header}</div>}
                  <button
                    data-active={active}
                    onMouseEnter={() => setCursor(i)}
                    onClick={() => pick(row)}
                    style={{ ...st.row, ...(active ? st.rowActive : {}) }}
                  >
                    <span style={{ ...st.rowIco, ...(active ? st.rowIcoActive : {}) }}>
                      <FleetIcon name={row.icon} size={15} stroke={1.6} />
                    </span>
                    <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
                      <span style={st.rowLabel}>{row.label}</span>
                      {row.sub && <span style={st.rowSub}>{row.sub}</span>}
                    </span>
                    {active && <FleetIcon name="arrow-right" size={14} stroke={1.8} />}
                  </button>
                </div>
              );
            })
          )}
        </div>

        <div style={st.footer}>
          <span><kbd style={st.kbdSm}>↑</kbd><kbd style={st.kbdSm}>↓</kbd> navigate</span>
          <span><kbd style={st.kbdSm}>↵</kbd> open</span>
          {searching && <span style={{ marginLeft: 'auto', color: 'var(--text-3)' }}>Searching…</span>}
        </div>
      </div>
    </div>,
    document.body,
  );
}

const st: Record<string, CSSProperties> = {
  scrim: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.5)',
    backdropFilter: 'blur(2px)',
    zIndex: 70,
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'center',
    padding: '12vh 16px 16px',
  },
  panel: {
    width: '100%',
    maxWidth: 560,
    background: 'var(--bg-1)',
    border: '1px solid var(--line-2)',
    borderRadius: 'var(--radius-lg)',
    boxShadow: 'var(--shadow-lg)',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    maxHeight: '70vh',
  },
  inputRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '13px 14px',
    borderBottom: '1px solid var(--line-1)',
    color: 'var(--text-3)',
    flexShrink: 0,
  },
  input: {
    flex: 1,
    background: 'transparent',
    border: 'none',
    outline: 'none',
    color: 'var(--text-1)',
    fontSize: 14.5,
    fontFamily: 'inherit',
    minWidth: 0,
  },
  kbd: {
    fontSize: 10.5,
    fontFamily: 'Geist Mono, monospace',
    color: 'var(--text-3)',
    background: 'var(--bg-2)',
    padding: '2px 6px',
    borderRadius: 4,
    border: '1px solid var(--line-1)',
    flexShrink: 0,
  },
  kbdSm: {
    fontSize: 10,
    fontFamily: 'Geist Mono, monospace',
    color: 'var(--text-2)',
    background: 'var(--bg-2)',
    padding: '1px 5px',
    borderRadius: 3,
    border: '1px solid var(--line-1)',
    marginRight: 3,
  },
  list: { overflowY: 'auto', padding: 6, flex: 1 },
  sectionLabel: {
    padding: '10px 10px 5px',
    fontSize: 10.5,
    fontWeight: 600,
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
    color: 'var(--text-3)',
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: 11,
    width: '100%',
    padding: '8px 10px',
    background: 'transparent',
    border: 'none',
    borderRadius: 'var(--radius)',
    cursor: 'pointer',
    textAlign: 'left',
    color: 'var(--text-2)',
    fontFamily: 'inherit',
  },
  rowActive: { background: 'var(--bg-hover)', color: 'var(--accent)' },
  rowIco: {
    flexShrink: 0,
    width: 28,
    height: 28,
    display: 'grid',
    placeItems: 'center',
    borderRadius: 8,
    background: 'var(--bg-2)',
    border: '1px solid var(--line-2)',
    color: 'var(--text-2)',
  },
  rowIcoActive: { color: 'var(--accent)', borderColor: 'var(--accent-line)', background: 'var(--accent-soft)' },
  rowLabel: { fontSize: 13.5, color: 'var(--text-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  rowSub: { fontSize: 11.5, color: 'var(--text-3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  empty: { padding: '28px 12px', textAlign: 'center', fontSize: 13, color: 'var(--text-3)' },
  footer: {
    display: 'flex',
    alignItems: 'center',
    gap: 14,
    padding: '9px 14px',
    borderTop: '1px solid var(--line-1)',
    fontSize: 11.5,
    color: 'var(--text-3)',
    flexShrink: 0,
  },
};
