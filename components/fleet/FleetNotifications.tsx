'use client';

import type { CSSProperties } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import FleetIcon from './FleetIcon';
import { useFleetTheme } from './FleetThemeRoot';

interface Notification {
  id: string;
  title: string;
  body: string;
  type: string;
  action_url?: string;
  source?: string;
  sender_label?: string | null;
  created_at: string;
  sent_at?: string;
  read_at: string | null;
}

/**
 * Topbar notification bell, styled with the fleet design tokens.
 *
 * A shared <NotificationBell> exists but is written against the older
 * globals.css token set (--bg-primary / --border-subtle / --shadow-elevated),
 * none of which resolve inside .fleetTheme — so it renders unstyled here.
 * This is the same API contract, drawn with fleet tokens instead.
 */
export default function FleetNotifications({
  variant = 'fleet',
  isMobile = false,
}: {
  variant?: 'fleet' | 'driver';
  isMobile?: boolean;
}) {
  const router = useRouter();
  const { theme } = useFleetTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const allHref = variant === 'driver' ? '/driver/notifications' : '/fleet/reminders';
  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  // "3m ago" is measured against this, captured on each poll rather than read
  // during render — keeps render pure and stops the labels drifting mid-paint.
  const [nowTs, setNowTs] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setNowTs(Date.now());
    try {
      const res = await fetch('/api/notifications?limit=10');
      if (!res.ok) return;
      const data = await res.json();
      setItems(
        (data.data || []).map((n: Notification) => ({
          ...n,
          created_at: n.created_at || n.sent_at || new Date().toISOString(),
        })),
      );
      setUnread(data.unread_count || 0);
    } catch {
      // Offline or transient — keep whatever we last showed.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      if (isMobile) return; // the sheet has its own scrim
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, isMobile]);

  const markAllRead = async () => {
    setItems((prev) => prev.map((n) => ({ ...n, read_at: n.read_at || new Date().toISOString() })));
    setUnread(0);
    try {
      await fetch('/api/notifications/read-all', { method: 'POST' });
    } catch {
      load();
    }
  };

  const openItem = async (n: Notification) => {
    setOpen(false);
    if (!n.read_at) {
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x)));
      setUnread((u) => Math.max(0, u - 1));
      try {
        await fetch(`/api/notifications/${n.id}/read`, { method: 'POST' });
      } catch {
        load();
      }
    }
    if (n.action_url) router.push(n.action_url);
  };

  const timeAgo = (iso: string) => {
    if (!nowTs) return '';
    const mins = Math.floor((nowTs - new Date(iso).getTime()) / 60000);
    if (mins < 1) return 'now';
    if (mins < 60) return `${mins}m`;
    if (mins < 1440) return `${Math.floor(mins / 60)}h`;
    if (mins < 10080) return `${Math.floor(mins / 1440)}d`;
    return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  };

  /**
   * The rules engine writes full sentences ("… (30 days left). Please renew
   * it."). In a 340px panel that wraps to three lines of mostly boilerplate,
   * so lift the countdown out into a pill and drop the closing instruction.
   * Every step is a no-op if the pattern isn't there, so unknown bodies pass
   * through untouched.
   */
  const condense = (body: string): { text: string; countdown: string | null } => {
    if (!body) return { text: '', countdown: null };
    const m = body.match(/\((\d+)\s+days?\s+left\)/i);
    const countdown = m ? `${m[1]}d left` : null;
    const text = body
      .replace(/\s*\((\d+)\s+days?\s+left\)/i, '')
      .replace(/\s*Please\b[^.!?]*[.!?]\s*$/i, '')
      .replace(/\s+/g, ' ')
      .replace(/[.\s]+$/, '')
      .trim();
    return { text, countdown };
  };

  /** Severity → the accent used for the row's icon and countdown pill. */
  const toneFor = (type: string) => {
    if (type === 'warning') return { color: 'var(--warn)', soft: 'var(--warn-soft)', icon: 'warning' };
    if (type === 'success') return { color: 'var(--pos)', soft: 'var(--pos-soft)', icon: 'check' };
    if (type === 'reminder') return { color: 'var(--accent)', soft: 'var(--accent-soft)', icon: 'bell' };
    return { color: 'var(--text-3)', soft: 'var(--bg-2)', icon: 'info' };
  };

  const panelBody = (
    <>
          <div style={st.head}>
            <span style={st.headTitle}>Notifications</span>
            {unread > 0 && (
              <button onClick={markAllRead} style={st.markAll} className="fleetHover">
                Mark all read
              </button>
            )}
          </div>

          <div style={st.list}>
            {loading ? (
              <div style={st.empty}>Loading…</div>
            ) : items.length === 0 ? (
              <div style={st.empty}>
                <FleetIcon name="bell" size={26} stroke={1.4} />
                <span style={{ marginTop: 8 }}>You&apos;re all caught up</span>
              </div>
            ) : (
              items.map((n, i) => {
                const tone = toneFor(n.type);
                const { text, countdown } = condense(n.body);
                const unreadRow = !n.read_at;
                return (
                  <button
                    key={n.id}
                    role="menuitem"
                    className="fleetMenuItem fleetNotifRow"
                    style={{
                      ...st.item,
                      borderBottom: i < items.length - 1 ? '1px solid var(--line-1)' : 'none',
                    }}
                    onClick={() => openItem(n)}
                  >
                    <span style={{ ...st.tone, color: tone.color, background: tone.soft }}>
                      <FleetIcon name={tone.icon} size={13} stroke={1.9} />
                    </span>

                    <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, flex: 1 }}>
                      <span style={st.titleRow}>
                        <span style={{ ...st.itemTitle, color: unreadRow ? 'var(--text-1)' : 'var(--text-2)' }}>
                          {n.title}
                        </span>
                        {n.source === 'platform' && (
                          <span style={st.senderBadge}>{n.sender_label || 'Rovora HQ'}</span>
                        )}
                        <span style={st.itemTime}>{timeAgo(n.created_at)}</span>
                      </span>

                      {text && <span style={st.itemBody}>{text}</span>}

                      {countdown && (
                        <span style={{ ...st.countPill, color: tone.color, background: tone.soft }}>
                          {countdown}
                        </span>
                      )}
                    </span>

                    {unreadRow && <span style={st.dot} />}
                  </button>
                );
              })
            )}
          </div>

          <button
            style={st.footer}
            className="fleetMenuFooter"
            onClick={() => { setOpen(false); router.push(allHref); }}
          >
            {variant === 'driver' ? 'View all notifications' : 'View all reminders'}
          </button>
    </>
  );

  return (
    <div ref={wrapRef} style={{ position: 'relative', display: 'flex' }} data-tour="notifications-bell">
      <button
        onClick={() => setOpen((o) => !o)}
        style={st.bellBtn}
        className="fleetIconBtn"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
      >
        <FleetIcon name="bell" size={16} />
        {unread > 0 && <span style={st.badge}>{unread > 9 ? '9+' : unread}</span>}
      </button>

      {/* Desktop: dropdown anchored to the bell. */}
      {open && !isMobile && (
        <div style={st.panel} className="fleetNewMenu" role="menu" aria-label="Notifications">
          {panelBody}
        </div>
      )}

      {/* Mobile: a 340px panel anchored to a bell near the right edge spills off
          the left of the screen, so use a full-width bottom sheet instead.
          Portalled to <body> to escape the topbar's stacking context. */}
      {open && isMobile && mounted && createPortal(
        <div
          className="fleetSheetScrim fleetTheme"
          data-fleet-theme={theme}
          style={st.sheetScrim}
          onClick={() => setOpen(false)}
        >
          <div
            className="fleetSheet"
            style={st.sheet}
            role="menu"
            aria-label="Notifications"
            onClick={(e) => e.stopPropagation()}
          >
            <div style={st.grabber} />
            {panelBody}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

const st: Record<string, CSSProperties> = {
  bellBtn: {
    position: 'relative',
    width: 32,
    height: 32,
    // Surface + border in fleet-theme.css (.fleetIconBtn) — inline blocks hover.
    borderRadius: 7,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: -6,
    right: -6,
    // Flex-centre rather than line-height: .fleetCanvas sets box-sizing:
    // border-box, so the 2px ring eats into the height and a line-height of
    // the full height pushes "9+" out of its own box.
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 18,
    height: 18,
    padding: '0 4px',
    background: 'var(--neg)',
    color: '#fff',
    fontSize: 9.5,
    fontWeight: 600,
    borderRadius: 100,
    border: '2px solid var(--bg-0)',
    pointerEvents: 'none',
  },
  panel: {
    position: 'absolute',
    top: 'calc(100% + 10px)',
    right: 0,
    width: 340,
    maxWidth: 'calc(100vw - 28px)',
    background: 'var(--bg-1)',
    border: '1px solid var(--line-2)',
    borderRadius: 'var(--radius-lg)',
    // Rows run edge to edge, so clip them to the panel's rounded corners.
    overflow: 'hidden',
    boxShadow: 'var(--shadow-lg)',
    zIndex: 40,
  },
  head: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 12px',
    borderBottom: '1px solid var(--line-1)',
    flexShrink: 0,
  },
  headTitle: { fontSize: 11, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--text-3)' },
  markAll: { background: 'transparent', border: 'none', color: 'var(--accent)', fontSize: 11.5, fontFamily: 'inherit', padding: 0 },
  sheetScrim: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.55)',
    backdropFilter: 'blur(2px)',
    zIndex: 60,
    display: 'flex',
    alignItems: 'flex-end',
  },
  sheet: {
    width: '100%',
    maxHeight: '78vh',
    display: 'flex',
    flexDirection: 'column',
    padding: '8px 0 env(safe-area-inset-bottom, 0px)',
    background: 'var(--bg-1)',
    borderTop: '1px solid var(--line-2)',
    borderRadius: 'var(--radius-lg) var(--radius-lg) 0 0',
    boxShadow: '0 -8px 32px rgba(0,0,0,0.3)',
  },
  grabber: { width: 36, height: 4, borderRadius: 2, background: 'var(--line-3)', margin: '2px auto 6px', flexShrink: 0 },
  list: { maxHeight: 360, overflowY: 'auto' },
  empty: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '26px 10px',
    color: 'var(--text-3)',
    fontSize: 12.5,
  },
  // Full-bleed rows separated by hairlines — the old rounded, tinted blocks
  // read as chunky once several stacked up.
  item: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 9,
    width: '100%',
    padding: '10px 12px',
    border: 'none',
    borderRadius: 0,
    cursor: 'pointer',
    textAlign: 'left',
    fontFamily: 'inherit',
  },
  tone: {
    flexShrink: 0,
    width: 22,
    height: 22,
    marginTop: 1,
    display: 'grid',
    placeItems: 'center',
    borderRadius: 6,
  },
  titleRow: { display: 'flex', alignItems: 'baseline', gap: 6, minWidth: 0 },
  itemTitle: {
    fontSize: 12.5,
    fontWeight: 500,
    minWidth: 0,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  itemBody: {
    fontSize: 11.5,
    color: 'var(--text-3)',
    lineHeight: 1.4,
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
  },
  itemTime: { fontSize: 10.5, color: 'var(--text-4)', marginLeft: 'auto', flexShrink: 0 },
  countPill: {
    alignSelf: 'flex-start',
    marginTop: 3,
    fontSize: 10,
    fontWeight: 600,
    letterSpacing: '0.02em',
    padding: '1.5px 6px',
    borderRadius: 100,
  },
  senderBadge: {
    fontSize: 9.5,
    fontWeight: 600,
    letterSpacing: '0.03em',
    textTransform: 'uppercase',
    padding: '1px 6px',
    borderRadius: 100,
    marginLeft: 6,
    color: 'var(--accent)',
    background: 'var(--accent-soft)',
  },
  dot: { width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0, marginTop: 8 },
  footer: {
    width: '100%',
    padding: '10px 12px',
    border: 'none',
    borderTop: '1px solid var(--line-1)',
    fontSize: 12.5,
    fontFamily: 'inherit',
    flexShrink: 0,
  },
};
