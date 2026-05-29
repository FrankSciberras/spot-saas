'use client';

import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import FleetIcon from './FleetIcon';

interface TourStep {
  target?: string;
  title: string;
  body: string;
}

const STEPS: TourStep[] = [
  {
    title: 'Welcome to Spot',
    body: "This quick tour shows you around your fleet dashboard. You're on a free 30-day trial — no card needed. Let's take a look.",
  },
  {
    target: '[data-tour="nav-dashboard"]',
    title: 'Your dashboard',
    body: 'Your command centre — live driver and vehicle stats, recent shifts, and documents that are about to expire.',
  },
  {
    target: '[data-tour="nav-drivers"]',
    title: 'Drivers',
    body: 'Add and manage your drivers here, along with their licences and documents. Start by adding your first driver.',
  },
  {
    target: '[data-tour="nav-vehicles"]',
    title: 'Vehicles',
    body: 'Your fleet lives here. Each vehicle keeps its own service and damage history.',
  },
  {
    target: '[data-tour="nav-rosters"]',
    title: 'Rosters',
    body: 'Assign drivers to vehicles for each day of the week, then publish — your drivers are notified automatically.',
  },
  {
    target: '[data-tour="nav-shifts"]',
    title: 'Shifts',
    body: 'See who is on the road right now, track mileage, and review live activity across your fleet.',
  },
  {
    target: '[data-tour="nav-settlements"]',
    title: 'Settlements',
    body: 'Work out driver earnings, deductions and payouts each period — all in one place.',
  },
  {
    target: '[data-tour="nav-settings"]',
    title: 'Settings',
    body: 'Customise your branding, manage your plan, and invite your team from here.',
  },
  {
    title: "You're all set!",
    body: 'Add your first driver and vehicle to get going. You can replay this tour any time from the ? button in the corner.',
  },
];

const PAD = 6;
const TIP_W = 340;

function storageKey(userId?: string) {
  return `fleet_tour_done_${userId || 'guest'}`;
}

interface Props {
  userId?: string;
  /** Only auto-start the tour for fleet operators (admins). */
  role?: string;
}

export default function FleetTour({ userId, role }: Props) {
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);

  const step = STEPS[i];

  useEffect(() => {
    setMounted(true);
    let done = false;
    try {
      done = localStorage.getItem(storageKey(userId)) === '1';
    } catch {
      /* ignore */
    }
    if (!done && role === 'admin') {
      const t = setTimeout(() => {
        setI(0);
        setOpen(true);
      }, 700);
      return () => clearTimeout(t);
    }
  }, [userId, role]);

  // Resolve the highlight rect for the current step.
  useEffect(() => {
    if (!open) return;
    if (!step?.target) {
      setRect(null);
      return;
    }
    const update = () => {
      try {
        const el = document.querySelector(step.target!);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          setRect(el.getBoundingClientRect());
        } else {
          setRect(null);
        }
      } catch {
        setRect(null);
      }
    };
    const t = setTimeout(update, 80);
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      clearTimeout(t);
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [open, i, step]);

  const finish = useCallback(() => {
    try {
      localStorage.setItem(storageKey(userId), '1');
    } catch {
      /* ignore */
    }
    setOpen(false);
    setI(0);
  }, [userId]);

  const restart = () => {
    setI(0);
    setOpen(true);
  };

  if (!mounted) return null;

  const isLast = i === STEPS.length - 1;

  // Tooltip placement: to the right of a highlighted target, else centred.
  let tipStyle: CSSProperties;
  if (rect) {
    const vh = window.innerHeight;
    const top = Math.min(Math.max(rect.top, 16), vh - 240);
    tipStyle = { position: 'fixed', left: rect.right + 16, top, width: TIP_W, zIndex: 10000 };
  } else {
    tipStyle = { position: 'fixed', left: '50%', top: '50%', width: TIP_W, transform: 'translate(-50%, -50%)', zIndex: 10000 };
  }

  return (
    <>
      <button onClick={restart} title="Replay tour" style={t.helpBtn} className="fleetHover">
        <FleetIcon name="doc" size={20} />
      </button>

      {open &&
        createPortal(
          <div className="fleetTheme" data-fleet-theme="dark" style={t.overlay}>
            {!rect && <div style={t.dim} />}
            {rect && (
              <div
                style={{
                  ...t.highlight,
                  top: rect.top - PAD,
                  left: rect.left - PAD,
                  width: rect.width + PAD * 2,
                  height: rect.height + PAD * 2,
                }}
              />
            )}

            <div style={tipStyle}>
              <div style={t.card}>
                <div style={t.header}>
                  <span style={t.counter}>{i + 1} / {STEPS.length}</span>
                  <button onClick={finish} style={t.close} title="Skip tour">
                    <FleetIcon name="close" size={15} />
                  </button>
                </div>
                <div style={t.title}>{step.title}</div>
                <div style={t.body}>{step.body}</div>
                <div style={t.dots}>
                  {STEPS.map((_, di) => (
                    <span key={di} style={{ ...t.dot, ...(di === i ? t.dotActive : {}), ...(di < i ? t.dotDone : {}) }} />
                  ))}
                </div>
                <div style={t.actions}>
                  {i > 0 ? (
                    <button onClick={() => setI((v) => v - 1)} style={t.ghost}>Back</button>
                  ) : (
                    <button onClick={finish} style={t.ghost}>Skip</button>
                  )}
                  <button
                    onClick={() => (isLast ? finish() : setI((v) => v + 1))}
                    style={t.primary}
                  >
                    {isLast ? 'Get started' : 'Next'}
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}

const t: Record<string, CSSProperties> = {
  helpBtn: {
    position: 'fixed',
    bottom: 20,
    left: 20,
    width: 44,
    height: 44,
    borderRadius: '50%',
    background: 'var(--bg-1)',
    border: '1px solid var(--line-2)',
    color: 'var(--text-2)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    zIndex: 40,
    boxShadow: '0 6px 20px rgba(0,0,0,0.3)',
  },
  overlay: { position: 'fixed', inset: 0, zIndex: 9998 },
  dim: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)' },
  highlight: {
    position: 'fixed',
    borderRadius: 9,
    boxShadow: '0 0 0 9999px rgba(0,0,0,0.45), 0 0 0 2px var(--accent), 0 0 18px rgba(91,141,255,0.55)',
    pointerEvents: 'none',
    zIndex: 9999,
    transition: 'all 0.2s ease',
  },
  card: {
    background: 'linear-gradient(180deg, #2c3447, #232a39)',
    border: '1px solid rgba(255,255,255,0.16)',
    borderRadius: 'var(--radius-lg)',
    boxShadow: '0 1px 0 rgba(255,255,255,0.08) inset, 0 24px 60px rgba(0,0,0,0.8)',
    padding: 18,
    zIndex: 10000,
    position: 'relative',
  },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  counter: {
    fontSize: 11,
    fontWeight: 600,
    color: 'var(--accent)',
    background: 'var(--accent-soft)',
    padding: '3px 10px',
    borderRadius: 20,
  },
  close: {
    width: 26,
    height: 26,
    borderRadius: 6,
    background: 'transparent',
    border: 'none',
    color: 'var(--text-3)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
  },
  title: { fontSize: 16, fontWeight: 600, color: 'var(--text-1)', marginBottom: 6, letterSpacing: '-0.01em' },
  body: { fontSize: 13.5, lineHeight: 1.55, color: 'var(--text-2)' },
  dots: { display: 'flex', gap: 6, margin: '14px 0' },
  dot: { width: 7, height: 7, borderRadius: '50%', background: 'var(--line-2)', transition: 'all 0.25s ease' },
  dotActive: { width: 20, borderRadius: 4, background: 'var(--accent)' },
  dotDone: { background: 'var(--accent)' },
  actions: { display: 'flex', justifyContent: 'space-between', gap: 10 },
  ghost: {
    padding: '9px 16px',
    background: 'transparent',
    border: '1px solid var(--line-2)',
    borderRadius: 8,
    color: 'var(--text-2)',
    fontSize: 13,
    fontFamily: 'inherit',
    cursor: 'pointer',
  },
  primary: {
    flex: 1,
    padding: '9px 16px',
    background: 'var(--accent)',
    border: '1px solid var(--accent)',
    borderRadius: 8,
    color: '#fff',
    fontSize: 13,
    fontWeight: 600,
    fontFamily: 'inherit',
    cursor: 'pointer',
  },
};
