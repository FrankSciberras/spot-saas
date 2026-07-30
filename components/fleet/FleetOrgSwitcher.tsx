'use client';

import type { CSSProperties } from 'react';
import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import type { SessionUser } from '@/lib/types/database';
import { setActiveOrgAction } from '@/lib/actions/org';
import FleetIcon from './FleetIcon';
import { useFleetTheme } from './FleetThemeRoot';

interface FleetOrgSwitcherProps {
  user: SessionUser;
  /** Custom fleet logo from Settings → Branding, if one is set. */
  logoUrl?: string | null;
  /** Desktop icon-rail mode: trigger collapses to the logo tile alone. */
  railed?: boolean;
  /** Below 720px the list opens as a bottom sheet instead of a dropdown. */
  isMobile?: boolean;
  /** Close the mobile drawer after switching. */
  onNavigate?: () => void;
}

/**
 * Fleet switcher in the sidebar header.
 *
 * Replaces the old static logo + "FLEET OPS" caption. The active fleet's name
 * is the trigger; the menu lists every org the user belongs to and switches
 * between them via setActiveOrgAction (which re-validates membership server
 * side and rewrites the active_org cookie).
 *
 * Creating additional fleets is not wired up yet — /onboarding deliberately
 * bounces anyone who already has a membership — so that row is marked "Soon"
 * rather than linking somewhere that would bounce straight back.
 */
export default function FleetOrgSwitcher({
  user,
  logoUrl,
  railed = false,
  isMobile = false,
  onNavigate,
}: FleetOrgSwitcherProps) {
  const router = useRouter();
  const { theme } = useFleetTheme();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [rect, setRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const [pending, startTransition] = useTransition();
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => setMounted(true), []);

  const memberships = user?.memberships ?? [];
  const activeName = user?.organization_name || 'Rovora';

  const place = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    // Anchor under the trigger, but never narrower than a readable menu and
    // never past the right edge of the viewport (matters in the 64px rail).
    const width = Math.max(r.width, 232);
    const left = Math.min(r.left, window.innerWidth - width - 12);
    setRect({ top: r.bottom + 6, left: Math.max(12, left), width });
  }, []);

  const toggle = () => {
    if (!open) place();
    setOpen((o) => !o);
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    const onResize = () => setOpen(false);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', onResize);
    return () => {
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onResize);
    };
  }, [open]);

  useEffect(() => {
    if (!open || !isMobile) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open, isMobile]);

  const switchTo = (orgId: string) => {
    if (orgId === user?.organization_id) {
      setOpen(false);
      return;
    }
    startTransition(async () => {
      await setActiveOrgAction(orgId);
      setOpen(false);
      onNavigate?.();
      router.refresh();
    });
  };

  // The generic Rovora mark is gone — the fleet name carries the identity. A
  // logo the operator actually uploaded (Settings → Branding) still shows,
  // otherwise that feature would have nowhere left to render.
  const tile = logoUrl ? (
    <span style={s.logoTile}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={logoUrl} alt="" style={s.logoImg} />
    </span>
  ) : null;

  // Collapsed rail has no room for the name, so it falls back to a monogram.
  const monogram = tile ?? <span style={s.monogram}>{activeName.charAt(0).toUpperCase()}</span>;

  const list = (
    <>
      <div style={s.menuLabel}>{memberships.length > 1 ? 'Your fleets' : 'Fleet'}</div>

      {(memberships.length ? memberships : [{
        organization_id: user?.organization_id,
        organization_name: activeName,
        organization_slug: '',
        role: user?.role,
        also_staff: user?.also_staff,
      }]).map((m) => {
        const active = m.organization_id === user?.organization_id;
        return (
          <button
            key={m.organization_id}
            role="menuitem"
            className="fleetMenuItem"
            style={s.orgRow}
            onClick={() => switchTo(m.organization_id as string)}
            disabled={pending}
          >
            <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
              <span style={s.orgName}>{m.organization_name || m.organization_slug || 'Unnamed fleet'}</span>
              <span style={s.orgRole}>{m.role || 'Member'}</span>
            </span>
            {active && <FleetIcon name="check" size={15} stroke={2} />}
          </button>
        );
      })}

      <div style={s.divider} />

      <div style={s.soonRow}>
        <FleetIcon name="plus" size={15} stroke={2} />
        <span style={{ flex: 1 }}>Add another fleet</span>
        <span style={s.soonBadge}>Soon</span>
      </div>
    </>
  );

  const trigger = (
    <button
      ref={triggerRef}
      onClick={toggle}
      style={{ ...s.trigger, ...(railed ? s.triggerRail : {}) }}
      className="fleetOrgTrigger"
      aria-haspopup="menu"
      aria-expanded={open}
      aria-label={`Current fleet: ${activeName}. Switch fleet`}
      // No native `title` in the rail — FleetSidebar draws its own tooltip.
    >
      {railed ? monogram : (
        <>
          {tile}
          <span style={s.triggerName}>{activeName}</span>
          <FleetIcon
            name="chevron-down"
            size={14}
            stroke={2}
            style={{ flexShrink: 0, opacity: 0.75, transition: 'transform .15s', transform: open ? 'rotate(180deg)' : 'none' }}
          />
        </>
      )}
    </button>
  );

  return (
    <>
      {trigger}
      {mounted && open && createPortal(
        // Portalled to <body> so the menu escapes both the sidebar's stacking
        // context and the mobile drawer's translateX (which would otherwise
        // capture position:fixed). Re-apply .fleetTheme for the design tokens.
        isMobile ? (
          <div
            className="fleetSheetScrim fleetTheme"
            data-fleet-theme={theme}
            style={s.sheetScrim}
            onClick={() => setOpen(false)}
          >
            <div
              className="fleetSheet"
              style={s.sheet}
              role="menu"
              aria-label="Switch fleet"
              onClick={(e) => e.stopPropagation()}
            >
              <div style={s.grabber} />
              {list}
            </div>
          </div>
        ) : (
          <>
            <div style={s.clickAway} onMouseDown={() => setOpen(false)} />
            <div
              className="fleetNewMenu fleetTheme"
              data-fleet-theme={theme}
              role="menu"
              aria-label="Switch fleet"
              style={{
                ...s.menu,
                top: rect?.top ?? 60,
                left: rect?.left ?? 12,
                width: rect?.width ?? 232,
                transformOrigin: 'top left',
              }}
            >
              {list}
            </div>
          </>
        ),
        document.body,
      )}
    </>
  );
}

const s: Record<string, CSSProperties> = {
  trigger: {
    display: 'flex',
    alignItems: 'center',
    gap: 9,
    width: '100%',
    padding: '7px 8px',
    // Background lives in fleet-theme.css (.fleetOrgTrigger) — inline would
    // outrank the :hover rule and kill the highlight.
    border: 'none',
    borderRadius: 8,
    cursor: 'pointer',
    fontFamily: 'inherit',
    textAlign: 'left',
    minWidth: 0,
  },
  triggerRail: { justifyContent: 'center', padding: '7px 0', gap: 0 },
  logoTile: {
    width: 26,
    height: 26,
    flexShrink: 0,
    display: 'grid',
    placeItems: 'center',
    borderRadius: 6,
    overflow: 'hidden',
  },
  logoImg: { maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' },
  monogram: {
    width: 28,
    height: 28,
    flexShrink: 0,
    display: 'grid',
    placeItems: 'center',
    borderRadius: 7,
    background: 'var(--accent-soft)',
    border: '1px solid var(--accent-line)',
    color: 'var(--accent)',
    fontSize: 12.5,
    fontWeight: 600,
  },
  triggerName: {
    flex: 1,
    minWidth: 0,
    fontSize: 13.5,
    fontWeight: 600,
    color: 'var(--text-1)',
    letterSpacing: '-0.01em',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },

  clickAway: { position: 'fixed', inset: 0, zIndex: 44 },
  menu: {
    position: 'fixed',
    padding: 6,
    background: 'var(--bg-1)',
    border: '1px solid var(--line-2)',
    borderRadius: 'var(--radius-lg)',
    boxShadow: 'var(--shadow-lg)',
    zIndex: 45,
  },

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
    padding: '8px 10px calc(14px + env(safe-area-inset-bottom, 0px))',
    background: 'var(--bg-1)',
    borderTop: '1px solid var(--line-2)',
    borderRadius: 'var(--radius-lg) var(--radius-lg) 0 0',
    boxShadow: '0 -8px 32px rgba(0,0,0,0.3)',
  },
  grabber: { width: 36, height: 4, borderRadius: 2, background: 'var(--line-3)', margin: '2px auto 10px' },

  menuLabel: {
    padding: '8px 10px 6px',
    fontSize: 10.5,
    fontWeight: 600,
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
    color: 'var(--text-3)',
  },
  orgRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    width: '100%',
    padding: '8px 10px',
    border: 'none',
    borderRadius: 'var(--radius)',
    cursor: 'pointer',
    textAlign: 'left',
    fontFamily: 'inherit',
    color: 'var(--accent)',
  },
  orgName: { fontSize: 13.5, fontWeight: 500, color: 'var(--text-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  orgRole: { fontSize: 11.5, color: 'var(--text-3)', textTransform: 'capitalize' },

  divider: { height: 1, background: 'var(--line-1)', margin: '5px 4px' },
  soonRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '8px 10px',
    fontSize: 13,
    color: 'var(--text-3)',
  },
  soonBadge: {
    fontSize: 9.5,
    fontWeight: 600,
    letterSpacing: '0.03em',
    textTransform: 'uppercase',
    padding: '2px 6px',
    borderRadius: 100,
    color: 'var(--warn)',
    background: 'var(--warn-soft)',
  },
};
