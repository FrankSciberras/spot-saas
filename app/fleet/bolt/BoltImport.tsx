'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ignoreBoltItemsAction,
  importFromBoltAction,
  setBoltNewMemberModeAction,
  skipBoltImportAction,
  undoBoltImportAction,
} from '@/lib/actions/bolt';
import type { BoltImportResult, NewMemberMode } from '@/lib/bolt/import';
import FleetIcon from '@/components/fleet/FleetIcon';
import styles from './bolt.module.css';

/** One Bolt driver or car that could become a Rovora record. */
export interface ImportItem {
  /** Bolt's id for it. */
  id: string;
  kind: 'driver' | 'vehicle';
  /** Driver's name, or the car's plate. */
  name: string;
  /** Phone number, or make / model / year. */
  detail: string | null;
  /** For a driver: the plate of the car they drive on Bolt. */
  car: string | null;
  group: 'new' | 'pending' | 'inactive' | 'ignored';
}

export interface ImportPanelData {
  /** first = the fleet hasn't been through the import yet. */
  stage: 'first' | 'ongoing';
  items: ImportItem[];
  /** Already in Rovora and linked. */
  linked: { drivers: number; vehicles: number };
  /** Room left on the plan (null = no limit). */
  room: { drivers: number | null; vehicles: number | null; planName: string };
  lastImport: { batchId: string; at: string; drivers: number; vehicles: number } | null;
  mode: NewMemberMode;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function counts(drivers: number, vehicles: number): string {
  const parts = [drivers ? plural(drivers, 'driver') : '', vehicles ? plural(vehicles, 'car') : ''].filter(Boolean);
  return parts.join(' and ') || 'nothing';
}

const MODE_LABEL: Record<NewMemberMode, string> = {
  review: 'Ask me first',
  auto: 'Add them automatically',
  off: 'Do nothing',
};

const GROUP_LABEL: Record<ImportItem['group'], string> = {
  new: 'New',
  pending: 'New on Bolt',
  inactive: 'Deactivated on Bolt',
  ignored: 'Not added',
};

/**
 * Bringing the fleet's Bolt drivers & cars into Rovora.
 *
 *   First time    "We found 24 drivers and 19 cars on Bolt" → Import
 *                 everything, or Let me choose, or I'll add them myself.
 *   After that    anyone new on Bolt (ask-first mode) waits here with Add /
 *                 Don't add; the rest of Bolt that isn't in Rovora can be
 *                 reviewed; the last import can be undone for 24 hours.
 */
export default function BoltImport({ data }: { data: ImportPanelData }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [result, setResult] = useState<BoltImportResult | null>(null);
  const [choosing, setChoosing] = useState(false);

  const drivers = data.items.filter((i) => i.kind === 'driver');
  const vehicles = data.items.filter((i) => i.kind === 'vehicle');
  const offered = (list: ImportItem[]) => list.filter((i) => i.group === 'new' || i.group === 'pending');
  const waiting = data.items.filter((i) => i.group === 'pending');
  const newDrivers = offered(drivers).length;
  const newVehicles = offered(vehicles).length;
  const inactive = data.items.filter((i) => i.group === 'inactive');

  const run = (fn: () => Promise<void>) => {
    setError('');
    setNotice('');
    startTransition(fn);
  };

  const doImport = (selection: { drivers: 'all' | string[]; vehicles: 'all' | string[] }) =>
    run(async () => {
      const res = await importFromBoltAction({ ...selection, first: data.stage === 'first' });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setResult(res.result);
      setChoosing(false);
      router.refresh();
    });

  const doIgnore = (ids: { drivers: string[]; vehicles: string[] }) =>
    run(async () => {
      const res = await ignoreBoltItemsAction(ids, true);
      if (res.error) setError(res.error);
      else router.refresh();
    });

  const doUndo = (batchId: string) =>
    run(async () => {
      const res = await undoBoltImportAction(batchId);
      if (res.error) {
        setError(res.error);
        return;
      }
      setResult(null);
      setNotice(res.message ?? 'Import undone.');
      router.refresh();
    });

  const doSkip = () =>
    run(async () => {
      const res = await skipBoltImportAction();
      if (res.error) setError(res.error);
      else router.refresh();
    });

  const idsOf = (list: ImportItem[]) => ({
    drivers: list.filter((i) => i.kind === 'driver').map((i) => i.id),
    vehicles: list.filter((i) => i.kind === 'vehicle').map((i) => i.id),
  });

  const undoTarget = result?.batchId
    ? { batchId: result.batchId, drivers: result.driversAdded, vehicles: result.vehiclesAdded }
    : data.lastImport;

  return (
    <section className={styles.importCard} id="bolt-import" aria-labelledby="bolt-import-title">
      {error && <div className={styles.error}>{error}</div>}
      {notice && <div className={styles.importNotice}>{notice}</div>}

      {result ? (
        <ImportResult result={result} onUndo={doUndo} pending={pending} />
      ) : data.stage === 'first' ? (
        <>
          <div className={styles.importHead}>
            <span className={styles.importIcon} aria-hidden><FleetIcon name="staff" size={20} stroke={1.8} /></span>
            <div>
              <h2 className={styles.importTitle} id="bolt-import-title">Bring your Bolt fleet into Rovora</h2>
              <p className={styles.importLead}>
                {newDrivers + newVehicles > 0 ? (
                  <>
                    We found <strong>{counts(newDrivers, newVehicles)}</strong> on Bolt that aren&rsquo;t in Rovora yet.
                    Add them in one go — no typing.
                  </>
                ) : (
                  <>Everyone on Bolt is already in Rovora — nothing to add.</>
                )}
              </p>
            </div>
          </div>

          <ul className={styles.importFacts}>
            {data.linked.drivers + data.linked.vehicles > 0 && (
              <li>
                <FleetIcon name="check" size={13} stroke={2} /> {counts(data.linked.drivers, data.linked.vehicles)} already
                in Rovora — linked to Bolt, nothing duplicated.
              </li>
            )}
            {inactive.length > 0 && (
              <li>
                <FleetIcon name="info" size={13} stroke={1.8} /> {counts(idsOf(inactive).drivers.length, idsOf(inactive).vehicles.length)} deactivated
                on Bolt — left out unless you pick them.
              </li>
            )}
            <li>
              <FleetIcon name="vehicle" size={13} stroke={1.8} /> Drivers get the car they drive on Bolt.
            </li>
            <li>
              <FleetIcon name="refresh" size={13} stroke={1.8} /> Changed your mind? Undo the import for 24 hours.
            </li>
          </ul>

          <PlanNote room={data.room} drivers={newDrivers} vehicles={newVehicles} />

          {choosing ? (
            <Chooser
              items={data.items}
              room={data.room}
              pending={pending}
              primaryLabel="Add selected"
              onAdd={(sel) => doImport(sel)}
              onCancel={() => setChoosing(false)}
            />
          ) : (
            <div className={styles.formActions}>
              {newDrivers + newVehicles > 0 ? (
                <>
                  <button
                    type="button"
                    className={styles.primary}
                    disabled={pending}
                    onClick={() => doImport({ drivers: 'all', vehicles: 'all' })}
                  >
                    {pending ? 'Adding your fleet…' : `Import everything (${counts(newDrivers, newVehicles)})`}
                  </button>
                  <button type="button" className={styles.ghostBtn} disabled={pending} onClick={() => setChoosing(true)}>
                    Let me choose
                  </button>
                  <button type="button" className={styles.linkBtn} disabled={pending} onClick={doSkip}>
                    I&rsquo;ll add them myself
                  </button>
                </>
              ) : (
                <button type="button" className={styles.primary} disabled={pending} onClick={doSkip}>
                  Done
                </button>
              )}
            </div>
          )}

          <ModeSetting mode={data.mode} first />
        </>
      ) : (
        <>
          {waiting.length > 0 && (
            <div className={styles.waiting}>
              <div className={styles.waitingHead}>
                <h2 className={styles.importTitle} id="bolt-import-title">
                  New on Bolt <span className={styles.countChip}>{waiting.length}</span>
                </h2>
                <div className={styles.controlRow}>
                  <button type="button" className={styles.primary} disabled={pending} onClick={() => doImport(idsOf(waiting))}>
                    Add all
                  </button>
                  <button type="button" className={styles.ghostBtn} disabled={pending} onClick={() => doIgnore(idsOf(waiting))}>
                    Don&rsquo;t add
                  </button>
                </div>
              </div>
              <p className={styles.importLead}>They joined your Bolt fleet since your last import and aren&rsquo;t in Rovora yet.</p>
              <PlanNote room={data.room} drivers={idsOf(waiting).drivers.length} vehicles={idsOf(waiting).vehicles.length} />
              <ul className={styles.waitingList}>
                {waiting.map((item) => (
                  <li key={`${item.kind}-${item.id}`} className={styles.waitingRow}>
                    <ItemText item={item} />
                    <span className={styles.waitingBtns}>
                      <button
                        type="button"
                        className={styles.ghostBtn}
                        disabled={pending}
                        onClick={() => doImport(idsOf([item]))}
                      >
                        Add
                      </button>
                      <button
                        type="button"
                        className={styles.linkBtn}
                        disabled={pending}
                        onClick={() => doIgnore(idsOf([item]))}
                      >
                        Don&rsquo;t add
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <OngoingSummary
            data={data}
            waitingCount={waiting.length}
            choosing={choosing}
            setChoosing={setChoosing}
            pending={pending}
            onAdd={doImport}
            onIgnore={doIgnore}
          />
        </>
      )}

      {!result && data.stage === 'ongoing' && undoTarget && (
        <p className={styles.importFoot}>
          Last import: {counts(undoTarget.drivers, undoTarget.vehicles)} added.{' '}
          <button type="button" className={styles.linkBtn} disabled={pending} onClick={() => doUndo(undoTarget.batchId)}>
            Undo
          </button>
        </p>
      )}
    </section>
  );
}

function ItemText({ item }: { item: ImportItem }) {
  return (
    <span className={styles.itemText}>
      <span className={styles.itemName}>
        <FleetIcon name={item.kind === 'driver' ? 'driver' : 'vehicle'} size={13} stroke={1.8} /> {item.name}
      </span>
      <span className={styles.itemDetail}>
        {[item.detail, item.car ? `drives ${item.car}` : null].filter(Boolean).join(' · ') || (item.kind === 'driver' ? 'Driver' : 'Car')}
      </span>
    </span>
  );
}

/** The plan can't take everyone — say so before they press the button. */
function PlanNote({ room, drivers, vehicles }: { room: ImportPanelData['room']; drivers: number; vehicles: number }) {
  const shortD = room.drivers !== null && drivers > room.drivers ? drivers - room.drivers : 0;
  const shortV = room.vehicles !== null && vehicles > room.vehicles ? vehicles - room.vehicles : 0;
  if (!shortD && !shortV) return null;
  return (
    <p className={styles.planNote}>
      Your {room.planName} plan has room for{' '}
      {[
        room.drivers !== null ? plural(room.drivers, 'more driver') : '',
        room.vehicles !== null ? plural(room.vehicles, 'more car') : '',
      ]
        .filter(Boolean)
        .join(' and ')}
      , so {counts(shortD, shortV)} won&rsquo;t be added. <Link href="/fleet/billing">Upgrade to add everyone</Link>.
    </p>
  );
}

function ImportResult({
  result,
  onUndo,
  pending,
}: {
  result: BoltImportResult;
  onUndo: (batchId: string) => void;
  pending: boolean;
}) {
  const added = result.driversAdded + result.vehiclesAdded;
  const linked = result.driversLinked + result.vehiclesLinked;
  const over = result.driversOverPlan + result.vehiclesOverPlan;
  return (
    <div className={styles.result}>
      <div className={styles.importHead}>
        <span className={styles.importIconOk} aria-hidden><FleetIcon name="check" size={20} stroke={2.2} /></span>
        <div>
          <h2 className={styles.importTitle} id="bolt-import-title">
            {added ? `Added ${counts(result.driversAdded, result.vehiclesAdded)} to Rovora` : 'Nothing new to add'}
          </h2>
          <ul className={styles.importFacts}>
            {linked > 0 && <li>{counts(result.driversLinked, result.vehiclesLinked)} already in Rovora — now linked to Bolt.</li>}
            {result.carsAssigned > 0 && <li>{plural(result.carsAssigned, 'driver')} given the car they drive on Bolt.</li>}
            {over > 0 && (
              <li>
                {counts(result.driversOverPlan, result.vehiclesOverPlan)} didn&rsquo;t fit your {result.planName} plan —{' '}
                <Link href="/fleet/billing">upgrade</Link> and add them from here.
              </li>
            )}
            {result.driversAdded > 0 && (
              <li>Imported drivers don&rsquo;t have a Rovora login yet. Invite them to the driver app from their page when you&rsquo;re ready.</li>
            )}
          </ul>
        </div>
      </div>
      <div className={styles.formActions}>
        {result.driversAdded > 0 && (
          <Link href="/fleet/drivers" className={styles.primary}>
            See your drivers
          </Link>
        )}
        {result.vehiclesAdded > 0 && (
          <Link href="/fleet/vehicles" className={styles.ghostBtn}>
            See your vehicles
          </Link>
        )}
        {result.batchId && (
          <button type="button" className={styles.linkBtn} disabled={pending} onClick={() => onUndo(result.batchId as string)}>
            {pending ? 'Undoing…' : 'Undo this import'}
          </button>
        )}
      </div>
    </div>
  );
}

/** After the first import: what's left on Bolt that isn't in Rovora, and the arrivals setting. */
function OngoingSummary({
  data,
  waitingCount,
  choosing,
  setChoosing,
  pending,
  onAdd,
  onIgnore,
}: {
  data: ImportPanelData;
  waitingCount: number;
  choosing: boolean;
  setChoosing: (v: boolean) => void;
  pending: boolean;
  onAdd: (sel: { drivers: string[]; vehicles: string[] }) => void;
  onIgnore: (ids: { drivers: string[]; vehicles: string[] }) => void;
}) {
  const rest = data.items.filter((i) => i.group !== 'pending');
  const restNew = rest.filter((i) => i.group === 'new');
  const restDrivers = restNew.filter((i) => i.kind === 'driver').length;
  const restVehicles = restNew.length - restDrivers;

  return (
    <div className={styles.ongoing} data-alone={waitingCount === 0 ? 'true' : undefined}>
      <div className={styles.ongoingLine}>
        <span>
          {restNew.length > 0 ? (
            <>
              <strong>{counts(restDrivers, restVehicles)}</strong> on Bolt {restNew.length === 1 ? 'isn’t' : 'aren’t'} in Rovora.
            </>
          ) : waitingCount === 0 ? (
            <>Your Bolt drivers and cars are in Rovora ({counts(data.linked.drivers, data.linked.vehicles)} linked).</>
          ) : null}
        </span>
        {rest.length > 0 && !choosing && (
          <button type="button" className={styles.linkBtn} onClick={() => setChoosing(true)}>
            {restNew.length > 0 ? 'Review and add' : 'Show everyone not in Rovora'}
          </button>
        )}
      </div>

      {choosing && (
        <Chooser
          items={rest}
          room={data.room}
          pending={pending}
          primaryLabel="Add selected"
          onAdd={(sel) => onAdd({ drivers: sel.drivers, vehicles: sel.vehicles })}
          onIgnore={(sel) => onIgnore(sel)}
          onCancel={() => setChoosing(false)}
        />
      )}

      <ModeSetting mode={data.mode} />
    </div>
  );
}

/** Tick who to add: drivers and cars, search, select all. */
function Chooser({
  items,
  room,
  pending,
  primaryLabel,
  onAdd,
  onIgnore,
  onCancel,
}: {
  items: ImportItem[];
  room: ImportPanelData['room'];
  pending: boolean;
  primaryLabel: string;
  onAdd: (sel: { drivers: string[]; vehicles: string[] }) => void;
  onIgnore?: (sel: { drivers: string[]; vehicles: string[] }) => void;
  onCancel: () => void;
}) {
  const [tab, setTab] = useState<'driver' | 'vehicle'>(items.some((i) => i.kind === 'driver') ? 'driver' : 'vehicle');
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<Set<string>>(
    () => new Set(items.filter((i) => i.group === 'new' || i.group === 'pending').map((i) => `${i.kind}:${i.id}`)),
  );

  const key = (i: ImportItem) => `${i.kind}:${i.id}`;
  const inTab = items.filter((i) => i.kind === tab);
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return inTab;
    return inTab.filter((i) => `${i.name} ${i.detail ?? ''} ${i.car ?? ''}`.toLowerCase().includes(q));
  }, [inTab, query]);

  const toggle = (i: ImportItem) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(key(i))) next.delete(key(i));
      else next.add(key(i));
      return next;
    });
  const allVisiblePicked = visible.length > 0 && visible.every((i) => picked.has(key(i)));
  const setVisible = (on: boolean) =>
    setPicked((prev) => {
      const next = new Set(prev);
      for (const i of visible) {
        if (on) next.add(key(i));
        else next.delete(key(i));
      }
      return next;
    });

  const selection = {
    drivers: items.filter((i) => i.kind === 'driver' && picked.has(key(i))).map((i) => i.id),
    vehicles: items.filter((i) => i.kind === 'vehicle' && picked.has(key(i))).map((i) => i.id),
  };
  const total = selection.drivers.length + selection.vehicles.length;
  const driverCount = items.filter((i) => i.kind === 'driver').length;
  const vehicleCount = items.length - driverCount;

  return (
    <div className={styles.chooser}>
      <div className={styles.chooserBar}>
        <div className={styles.rangeTabs} role="tablist" aria-label="Drivers or cars">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'driver'}
            className={styles.rangeTab}
            data-active={tab === 'driver' ? 'true' : undefined}
            onClick={() => setTab('driver')}
          >
            Drivers ({driverCount})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'vehicle'}
            className={styles.rangeTab}
            data-active={tab === 'vehicle' ? 'true' : undefined}
            onClick={() => setTab('vehicle')}
          >
            Cars ({vehicleCount})
          </button>
        </div>
        <input
          className={`${styles.input} ${styles.chooserSearch}`}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={tab === 'driver' ? 'Search name or phone' : 'Search plate or model'}
          aria-label="Search"
        />
      </div>

      <label className={styles.chooserAll}>
        <input type="checkbox" checked={allVisiblePicked} onChange={(e) => setVisible(e.target.checked)} />
        {allVisiblePicked ? 'Untick all' : 'Tick all'} {query ? 'shown' : tab === 'driver' ? 'drivers' : 'cars'}
      </label>

      <ul className={styles.chooserList}>
        {visible.length === 0 && <li className={styles.panelEmpty}>Nobody here.</li>}
        {visible.map((i) => (
          <li key={key(i)}>
            <label className={styles.chooserRow}>
              <input type="checkbox" checked={picked.has(key(i))} onChange={() => toggle(i)} />
              <ItemText item={i} />
              {i.group !== 'new' && <span className={styles.groupChip} data-group={i.group}>{GROUP_LABEL[i.group]}</span>}
            </label>
          </li>
        ))}
      </ul>

      <PlanNote room={room} drivers={selection.drivers.length} vehicles={selection.vehicles.length} />

      <div className={styles.formActions}>
        <button type="button" className={styles.primary} disabled={pending || total === 0} onClick={() => onAdd(selection)}>
          {pending ? 'Adding…' : total ? `${primaryLabel}: ${counts(selection.drivers.length, selection.vehicles.length)}` : primaryLabel}
        </button>
        {onIgnore && (
          <button type="button" className={styles.ghostBtn} disabled={pending || total === 0} onClick={() => onIgnore(selection)}>
            Don&rsquo;t add selected
          </button>
        )}
        <button type="button" className={styles.linkBtn} disabled={pending} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

/** "When someone new joins your Bolt fleet" — ask first (default), add, or nothing. */
function ModeSetting({ mode, first = false }: { mode: NewMemberMode; first?: boolean }) {
  const router = useRouter();
  const [value, setValue] = useState<NewMemberMode>(mode);
  const [saving, startSaving] = useTransition();
  const [error, setError] = useState('');

  const change = (next: NewMemberMode) => {
    const before = value;
    setValue(next);
    setError('');
    startSaving(async () => {
      const res = await setBoltNewMemberModeAction(next);
      if (res.error) {
        setValue(before);
        setError(res.error);
      } else {
        router.refresh();
      }
    });
  };

  return (
    <div className={styles.modeRow}>
      <label htmlFor="bolt-new-member-mode" className={styles.modeLabel}>
        {first ? 'Later, when someone new joins your Bolt fleet:' : 'When someone new joins your Bolt fleet:'}
      </label>
      <select
        id="bolt-new-member-mode"
        className={styles.filterSelect}
        value={value}
        disabled={saving}
        onChange={(e) => change(e.target.value as NewMemberMode)}
      >
        {(Object.keys(MODE_LABEL) as NewMemberMode[]).map((m) => (
          <option key={m} value={m}>
            {MODE_LABEL[m]}
            {m === 'review' ? ' (recommended)' : ''}
          </option>
        ))}
      </select>
      <span className={styles.modeHint}>
        {value === 'review'
          ? 'We’ll let you know and you add them with one tap.'
          : value === 'auto'
            ? 'They’re added to Rovora within the hour.'
            : 'Nothing happens — add people yourself.'}
      </span>
      {error && <span className={styles.noteError}>{error}</span>}
    </div>
  );
}
