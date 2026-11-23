'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import FleetIcon from './FleetIcon';
import { useEnabledModules } from './FleetModulesProvider';
import { usePreferences, useSettingsAdmin } from './FleetSettingsProvider';
import {
  MAX_QUICK_BUTTONS,
  NO_QUICK_BUTTON,
  QUICK_SLOT_KEYS,
  availableQuickActions,
  resolveQuickButtons,
  type QuickAction,
} from '@/lib/quick-buttons';

/**
 * Up to four personal shortcuts in the top bar, next to the page title —
 * "Add expense", "New roster", "Driver balances" and so on. A dashed
 * "Add quick button" opens the picker; once a button exists it shrinks to a
 * dashed "+" so the row stays quiet.
 *
 * The choice is saved to the person's preferences, so it is the same on every
 * device they sign in on. Desktop only: there is no room in the phone top bar.
 */
export default function FleetQuickButtons({ isAdmin }: { isAdmin: boolean }) {
  const modules = useEnabledModules();
  const prefs = usePreferences();
  const { savePrefs } = useSettingsAdmin();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const available = availableQuickActions(isAdmin, modules);
  const buttons = resolveQuickButtons(QUICK_SLOT_KEYS.map((k) => prefs[k]), available);
  const chosen = new Set(buttons.map((b) => b.id));
  const full = buttons.length >= MAX_QUICK_BUTTONS;

  // Close the picker on outside click or Escape.
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Nothing this person could pin (every module off) — draw nothing at all.
  if (available.length === 0) return null;

  /** Writes the list back into the four slots, packed to the front. */
  const save = async (next: QuickAction[]) => {
    setError(null);
    const patch = Object.fromEntries(
      QUICK_SLOT_KEYS.map((key, i) => [key, next[i]?.id ?? NO_QUICK_BUTTON]),
    );
    const failed = await savePrefs(patch);
    if (failed) setError(failed);
  };

  const toggle = (action: QuickAction) => {
    if (chosen.has(action.id)) void save(buttons.filter((b) => b.id !== action.id));
    else if (!full) void save([...buttons, action]);
  };

  const groups: { heading: string; items: QuickAction[] }[] = [
    { heading: 'Add something', items: available.filter((a) => a.kind === 'add') },
    { heading: 'Jump to', items: available.filter((a) => a.kind === 'open') },
  ].filter((g) => g.items.length > 0);

  return (
    <div className="fleetQuick hide-mobile" data-empty={buttons.length === 0 ? 'true' : undefined} ref={wrapRef}>
      {buttons.map((b) => (
        <Link key={b.id} href={b.href} className="fleetQuickBtn" title={b.title} aria-label={b.title}>
          <FleetIcon name={b.icon} size={14} />
          <span className="fleetQuickLbl">{b.label}</span>
        </Link>
      ))}

      <button
        type="button"
        className="fleetQuickBtn fleetQuickAdd"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        title={buttons.length === 0 ? 'Pin a shortcut here' : 'Change your quick buttons'}
        aria-label={buttons.length === 0 ? 'Add quick button' : 'Change your quick buttons'}
      >
        <FleetIcon name={full ? 'pencil' : 'plus'} size={13} stroke={2} />
        {buttons.length === 0 && <span className="fleetQuickLbl">Add quick button</span>}
      </button>

      {open && (
        <div className="fleetQuickMenu fleetNewMenu" role="dialog" aria-label="Quick buttons">
          <div className="fleetQuickMenuHead">
            <span>Quick buttons</span>
            <span className="mono tnum" data-full={full ? 'true' : undefined}>
              {buttons.length} of {MAX_QUICK_BUTTONS}
            </span>
          </div>
          <p className="fleetQuickMenuSub">
            {full
              ? 'That’s the most that fit. Take one off to pin another.'
              : 'Pin up to four shortcuts to the top bar. Only you see them.'}
          </p>

          <div className="fleetQuickMenuList">
            {groups.map((g) => (
              <div key={g.heading}>
                <div className="fleetQuickMenuLabel">{g.heading}</div>
                {g.items.map((a) => {
                  const on = chosen.has(a.id);
                  return (
                    <button
                      key={a.id}
                      type="button"
                      role="menuitemcheckbox"
                      aria-checked={on}
                      className="fleetNewItem fleetQuickItem"
                      data-on={on ? 'true' : undefined}
                      disabled={!on && full}
                      onClick={() => toggle(a)}
                    >
                      <span className="fleetNewItemIco fleetQuickItemIco">
                        <FleetIcon name={a.icon} size={15} />
                      </span>
                      <span className="fleetQuickItemText">
                        <span className="fleetQuickItemTitle">{a.title}</span>
                        <span className="fleetQuickItemHint">{a.hint}</span>
                      </span>
                      <span className="fleetQuickItemCheck" aria-hidden="true">
                        {on ? <FleetIcon name="check" size={13} stroke={2.4} /> : <FleetIcon name="plus" size={13} stroke={2} />}
                      </span>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>

          {error && <p className="fleetQuickMenuError" role="alert">{error}</p>}
        </div>
      )}
    </div>
  );
}
