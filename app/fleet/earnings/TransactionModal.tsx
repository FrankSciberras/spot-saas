'use client';

// =============================================================================
// TRANSACTION MODAL — "today I spent €20 on X"
// =============================================================================
// The one form behind every Add expense / Add income button. Designed for a
// phone in a car park as much as a desk: amount first and huge, today is the
// default date, categories are one-tap chips, and the receipt field opens the
// camera. Everything past the amount + category is optional.
//
// Add mode offers "Save & add another" (Xero / Wave do the same) so a handful
// of receipts can be keyed in one after the other without reopening the form.
// =============================================================================

import { type CSSProperties, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import FleetIcon from '@/components/fleet/FleetIcon';
import type { FinanceTransaction, PaymentMethod } from '@/lib/types/database';
import { categoriesOfKind, type CategoryKind, type FinanceCategory } from '@/lib/config/financeCategories';
import { todayISO, formatDateLong } from '@/lib/utils/financeRanges';
import { parseDate, toISODate } from '@/lib/utils/bookkeepingPeriods';
import {
  createTransactionAction,
  updateTransactionAction,
  deleteTransactionAction,
  uploadReceiptAction,
  removeReceiptAction,
  getReceiptUrlAction,
} from '@/lib/actions/finance-transactions';

export interface VehicleOption {
  id: string;
  registration_number: string;
  make: string | null;
  model: string | null;
}

export interface DriverOption {
  id: string;
  full_name: string;
  status?: string | null;
}

interface TransactionModalProps {
  categories: FinanceCategory[];
  vehicles: VehicleOption[];
  drivers: DriverOption[];
  /** Kind to start on when adding. Ignored when editing. */
  initialKind?: CategoryKind;
  /** Pre-select a date (e.g. from a day group). Defaults to today. */
  initialDate?: string;
  /** Present = edit this transaction. */
  transaction?: FinanceTransaction | null;
  onClose: () => void;
  /** Called after a successful save / delete so the parent can refresh. */
  onSaved?: () => void;
  onManageCategories?: () => void;
}

const PAYMENT_OPTIONS: { value: PaymentMethod; label: string; icon: string }[] = [
  { value: 'card', label: 'Card', icon: 'settle' },
  { value: 'cash', label: 'Cash', icon: 'euro' },
  { value: 'bank', label: 'Bank', icon: 'book' },
  { value: 'other', label: 'Other', icon: 'dots' },
];

function yesterdayISO(): string {
  return toISODate(new Date(parseDate(todayISO()).getTime() - 86_400_000));
}

export default function TransactionModal({
  categories, vehicles, drivers, initialKind = 'expense', initialDate, transaction, onClose, onSaved, onManageCategories,
}: TransactionModalProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const isEdit = !!transaction;

  const categoryById = useMemo(() => {
    const m = new Map<string, FinanceCategory>();
    categories.forEach((c) => m.set(c.id, c));
    return m;
  }, [categories]);

  const [kind, setKind] = useState<CategoryKind>(
    transaction ? (categoryById.get(transaction.category_id)?.kind ?? 'expense') : initialKind,
  );
  const [amount, setAmount] = useState(transaction ? String(transaction.amount) : '');
  const [date, setDate] = useState(transaction?.txn_date?.split('T')[0] ?? initialDate ?? todayISO());
  const [categoryId, setCategoryId] = useState(transaction?.category_id ?? '');
  const [description, setDescription] = useState(transaction?.description ?? '');
  const [counterparty, setCounterparty] = useState(transaction?.counterparty ?? '');
  const [vehicleId, setVehicleId] = useState(transaction?.vehicle_id ?? '');
  const [driverId, setDriverId] = useState(transaction?.driver_id ?? '');
  const [method, setMethod] = useState<PaymentMethod>(transaction?.payment_method ?? 'card');
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);
  const [hasReceipt, setHasReceipt] = useState(!!transaction?.receipt_path);
  const [showMore, setShowMore] = useState(
    !!(transaction && (transaction.counterparty || transaction.vehicle_id || transaction.driver_id)),
  );
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const amountRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Categories for the current kind, active ones only — plus the one already
  // on the transaction if it has since been hidden, so editing doesn't lose it.
  const kindCategories = useMemo(() => {
    const list = categoriesOfKind(categories, kind);
    if (transaction) {
      const current = categoryById.get(transaction.category_id);
      if (current && current.kind === kind && !list.some((c) => c.id === current.id)) list.push(current);
    }
    return list;
  }, [categories, kind, transaction, categoryById]);

  useEffect(() => {
    // Autofocus the amount — it is the first thing anyone wants to type.
    const t = setTimeout(() => amountRef.current?.focus(), 30);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Switching kind clears a category that no longer applies.
  const switchKind = (k: CategoryKind) => {
    setKind(k);
    if (categoryId && categoryById.get(categoryId)?.kind !== k) setCategoryId('');
  };

  // Object URLs for the receipt thumbnail are created in the change handler;
  // the effect cleanup revokes the previous one when it is replaced or on unmount.
  const pickReceipt = (file: File | null) => {
    setReceiptFile(file);
    setReceiptPreview(file && file.type.startsWith('image/') ? URL.createObjectURL(file) : null);
  };
  useEffect(() => () => { if (receiptPreview) URL.revokeObjectURL(receiptPreview); }, [receiptPreview]);

  const parsedAmount = parseFloat(amount.replace(',', '.'));
  const canSave = Number.isFinite(parsedAmount) && parsedAmount > 0 && !!categoryId && !!date && !pending;

  const buildInput = () => ({
    txn_date: date,
    category_id: categoryId,
    amount: Math.round(parsedAmount * 100) / 100,
    description: description.trim() || null,
    counterparty: counterparty.trim() || null,
    payment_method: method,
    vehicle_id: vehicleId || null,
    driver_id: driverId || null,
  });

  const resetForAnother = () => {
    setAmount('');
    setDescription('');
    setCounterparty('');
    pickReceipt(null);
    if (fileRef.current) fileRef.current.value = '';
    setError(null);
    setTimeout(() => amountRef.current?.focus(), 30);
  };

  const save = (andAnother: boolean) => {
    if (!canSave) return;
    setError(null);
    setFlash(null);
    startTransition(async () => {
      const input = buildInput();
      let id = transaction?.id ?? null;

      const res = isEdit && id
        ? await updateTransactionAction(id, input)
        : await createTransactionAction(input);
      if (res.error) { setError(res.error); return; }
      if (!id) id = res.id ?? null;

      if (receiptFile && id) {
        const fd = new FormData();
        fd.append('file', receiptFile);
        const up = await uploadReceiptAction(id, fd);
        if (up.error) {
          // The line itself is saved — say so, and let them retry the photo.
          setError(`Saved, but the receipt did not upload: ${up.error}`);
          setHasReceipt(false);
          router.refresh();
          onSaved?.();
          return;
        }
      }

      router.refresh();
      onSaved?.();
      if (andAnother) {
        const c = categoryById.get(categoryId);
        setFlash(`Saved ${kind === 'income' ? '+' : '−'}€${input.amount.toFixed(2)}${c ? ` · ${c.name}` : ''}`);
        resetForAnother();
      } else {
        onClose();
      }
    });
  };

  const remove = () => {
    if (!transaction) return;
    startTransition(async () => {
      const res = await deleteTransactionAction(transaction.id);
      if (res.error) { setError(res.error); return; }
      router.refresh();
      onSaved?.();
      onClose();
    });
  };

  const viewReceipt = () => {
    if (!transaction) return;
    startTransition(async () => {
      const res = await getReceiptUrlAction(transaction.id);
      if (res.url) window.open(res.url, '_blank', 'noopener');
      else setError(res.error ?? 'Could not open the receipt.');
    });
  };

  const detachReceipt = () => {
    if (!transaction) return;
    startTransition(async () => {
      const res = await removeReceiptAction(transaction.id);
      if (res.error) { setError(res.error); return; }
      setHasReceipt(false);
      router.refresh();
    });
  };

  const isExpense = kind === 'expense';
  const accent = isExpense ? 'var(--neg)' : 'var(--pos)';
  const today = todayISO();
  const yesterday = yesterdayISO();

  return (
    <div style={st.overlay} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={st.modal} role="dialog" aria-modal="true" aria-label={isEdit ? 'Edit transaction' : 'Add transaction'}>
        {/* Head */}
        <div style={st.modalHead}>
          <div style={{ display: 'flex', gap: 4, background: 'var(--bg-2)', border: '1px solid var(--line-2)', borderRadius: 8, padding: 3 }}>
            {(['expense', 'income'] as CategoryKind[]).map((k) => {
              const on = kind === k;
              return (
                <button
                  key={k}
                  onClick={() => switchKind(k)}
                  style={{
                    padding: '6px 14px', borderRadius: 6, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 500,
                    background: on ? 'var(--bg-0)' : 'transparent',
                    color: on ? (k === 'expense' ? 'var(--neg)' : 'var(--pos)') : 'var(--text-3)',
                    boxShadow: on ? '0 1px 2px rgba(0,0,0,0.15)' : 'none',
                  }}
                >
                  {k === 'expense' ? 'Expense' : 'Income'}
                </button>
              );
            })}
          </div>
          <button onClick={onClose} style={st.closeBtn} aria-label="Close"><FleetIcon name="close" size={16} /></button>
        </div>

        <div style={st.modalBody}>
          {error && <div style={{ ...st.alert, color: 'var(--neg)', background: 'var(--neg-soft)', border: '1px solid rgba(240,100,100,0.25)' }}>{error}</div>}
          {flash && <div style={{ ...st.alert, color: 'var(--pos)', background: 'var(--pos-soft)', border: '1px solid rgba(62,207,142,0.25)' }}>{flash} — add the next one below.</div>}

          {/* Amount */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '10px 0 2px' }}>
            <span style={{ fontSize: 30, color: accent, fontWeight: 500 }}>{isExpense ? '−' : '+'}</span>
            <span style={{ fontSize: 30, color: 'var(--text-3)' }}>€</span>
            <input
              ref={amountRef}
              type="text"
              inputMode="decimal"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^0-9.,]/g, ''))}
              onKeyDown={(e) => { if (e.key === 'Enter') save(false); }}
              style={{
                width: Math.max(4, amount.length + 1) + 'ch', minWidth: 110, maxWidth: 260, background: 'transparent', border: 'none', outline: 'none',
                fontFamily: 'Geist Mono, monospace', fontSize: 40, fontWeight: 500, letterSpacing: '-0.02em', color: 'var(--text-1)', fontVariantNumeric: 'tabular-nums',
              }}
              aria-label="Amount in euro"
            />
          </div>

          {/* Date */}
          <div>
            <label style={st.fieldLabel}>When</label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <button style={{ ...st.chip, ...(date === today ? st.chipOn : {}) }} onClick={() => setDate(today)}>Today</button>
              <button style={{ ...st.chip, ...(date === yesterday ? st.chipOn : {}) }} onClick={() => setDate(yesterday)}>Yesterday</button>
              <input type="date" value={date} max={today} onChange={(e) => e.target.value && setDate(e.target.value)} style={{ ...st.textInput, width: 'auto', flex: '0 0 auto' }} aria-label="Date" />
              {date !== today && date !== yesterday && <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{formatDateLong(date)}</span>}
            </div>
          </div>

          {/* Category */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <label style={st.fieldLabel}>{isExpense ? 'What kind of expense?' : 'What kind of income?'}</label>
              {onManageCategories && (
                <button style={st.linkBtn} onClick={onManageCategories}>Manage categories</button>
              )}
            </div>
            {kindCategories.length === 0 ? (
              <div style={{ fontSize: 12.5, color: 'var(--text-3)' }}>No {kind} categories yet — add one under Manage categories.</div>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {kindCategories.map((c) => {
                  const on = categoryId === c.id;
                  return (
                    <button
                      key={c.id}
                      onClick={() => setCategoryId(c.id)}
                      style={{
                        ...st.chip,
                        display: 'inline-flex', alignItems: 'center', gap: 7,
                        ...(on ? { background: 'var(--accent-soft)', border: '1px solid var(--accent)', color: 'var(--text-1)' } : {}),
                      }}
                    >
                      <span style={{ width: 8, height: 8, borderRadius: 2, background: c.color }} />
                      {c.name}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Description */}
          <div>
            <label style={st.fieldLabel}>What was it? <span style={{ textTransform: 'none', letterSpacing: 0, color: 'var(--text-3)' }}>(optional)</span></label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') save(false); }}
              placeholder={isExpense ? 'e.g. Car wash, front tyres, parking at airport' : 'e.g. Uber weekly payout, airport transfer'}
              maxLength={200}
              style={st.textInput}
            />
          </div>

          {/* Payment method */}
          <div>
            <label style={st.fieldLabel}>{isExpense ? 'Paid with' : 'Received into'}</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {PAYMENT_OPTIONS.map((p) => {
                const on = method === p.value;
                return (
                  <button key={p.value} onClick={() => setMethod(p.value)} style={{ ...st.chip, display: 'inline-flex', alignItems: 'center', gap: 6, ...(on ? st.chipOn : {}) }}>
                    <FleetIcon name={p.icon} size={12} /> {p.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Receipt */}
          <div>
            <label style={st.fieldLabel}>Receipt <span style={{ textTransform: 'none', letterSpacing: 0, color: 'var(--text-3)' }}>(optional)</span></label>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              {/* No `capture` attribute on purpose: with it, iOS skips the "Photo
                  Library" option and forces the camera. Without it a phone
                  offers Take Photo / Library / Files — same as Xero's app. */}
              <input
                ref={fileRef}
                type="file"
                accept="image/*,application/pdf"
                onChange={(e) => pickReceipt(e.target.files?.[0] ?? null)}
                style={{ display: 'none' }}
                id="txn-receipt-input"
              />
              <button style={{ ...st.chip, display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={() => fileRef.current?.click()}>
                <FleetIcon name="upload" size={12} /> {receiptFile ? 'Change photo' : hasReceipt ? 'Replace receipt' : 'Snap or upload receipt'}
              </button>
              {receiptPreview && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={receiptPreview} alt="Receipt preview" style={{ height: 44, width: 44, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--line-2)' }} />
              )}
              {receiptFile && !receiptPreview && <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{receiptFile.name}</span>}
              {receiptFile && (
                <button style={st.linkBtn} onClick={() => { pickReceipt(null); if (fileRef.current) fileRef.current.value = ''; }}>Remove</button>
              )}
              {!receiptFile && hasReceipt && isEdit && (
                <>
                  <button style={{ ...st.linkBtn, display: 'inline-flex', alignItems: 'center', gap: 4 }} onClick={viewReceipt} disabled={pending}>
                    <FleetIcon name="eye" size={12} /> View receipt
                  </button>
                  <button style={{ ...st.linkBtn, color: 'var(--neg)' }} onClick={detachReceipt} disabled={pending}>Remove</button>
                </>
              )}
            </div>
          </div>

          {/* More details */}
          <button style={{ ...st.linkBtn, alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 4 }} onClick={() => setShowMore((v) => !v)}>
            <FleetIcon name={showMore ? 'chevron-down' : 'chevron-right'} size={12} /> {showMore ? 'Fewer details' : 'More details — who, which car, which driver'}
          </button>

          {showMore && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }} className="grid-2">
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={st.fieldLabel}>{isExpense ? 'Paid to' : 'Received from'}</label>
                <input type="text" value={counterparty} onChange={(e) => setCounterparty(e.target.value)} placeholder={isExpense ? 'e.g. Shell, Kwik Fit, Transport Malta' : 'e.g. Uber, Bolt, a corporate client'} maxLength={80} style={st.textInput} />
              </div>
              <div>
                <label style={st.fieldLabel}>Vehicle</label>
                <select value={vehicleId} onChange={(e) => setVehicleId(e.target.value)} style={st.textInput}>
                  <option value="">Not for a specific car</option>
                  {vehicles.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.registration_number}{v.make ? ` · ${v.make}${v.model ? ` ${v.model}` : ''}` : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label style={st.fieldLabel}>Driver</label>
                <select value={driverId} onChange={(e) => setDriverId(e.target.value)} style={st.textInput}>
                  <option value="">Not for a specific driver</option>
                  {drivers.map((d) => (
                    <option key={d.id} value={d.id}>{d.full_name}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {isEdit && transaction?.source !== 'manual' && (
            <div style={{ fontSize: 11.5, color: 'var(--text-3)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <FleetIcon name="info" size={12} />
              {transaction?.source === 'recurring'
                ? 'Posted automatically from a recurring vehicle cost. You can still change it.'
                : 'Imported from your old period-based books (dated on the day that period ended).'}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={st.modalFoot}>
          <div>
            {isEdit && !confirmDelete && (
              <button style={{ ...st.miniBtn, color: 'var(--neg)', border: '1px solid rgba(240,100,100,0.25)' }} onClick={() => setConfirmDelete(true)} disabled={pending}>Delete</button>
            )}
            {isEdit && confirmDelete && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--text-2)' }}>
                Delete this line?
                <button style={{ ...st.miniBtn, color: 'var(--neg)', border: '1px solid rgba(240,100,100,0.4)' }} onClick={remove} disabled={pending}>Yes, delete</button>
                <button style={st.miniBtn} onClick={() => setConfirmDelete(false)}>No</button>
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <button style={st.miniBtn} onClick={onClose} disabled={pending}>Cancel</button>
            {!isEdit && (
              <button style={{ ...st.miniBtn, border: '1px solid var(--accent-line)', color: 'var(--accent)' }} onClick={() => save(true)} disabled={!canSave}>
                Save &amp; add another
              </button>
            )}
            <button style={{ ...st.primaryBtn, opacity: canSave ? 1 : 0.5 }} className="fleetHover" onClick={() => save(false)} disabled={!canSave}>
              {pending ? 'Saving…' : isEdit ? 'Save changes' : isExpense ? 'Save expense' : 'Save income'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const st: Record<string, CSSProperties> = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, zIndex: 200 },
  modal: { width: '100%', maxWidth: 560, maxHeight: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg-0)', border: '1px solid var(--line-1)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' },
  modalHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', gap: 12, borderBottom: '1px solid var(--line-1)', flexShrink: 0 },
  modalBody: { padding: 16, display: 'flex', flexDirection: 'column', gap: 14, flex: '1 1 auto', minHeight: 0, overflowY: 'auto' },
  modalFoot: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '12px 16px', borderTop: '1px solid var(--line-1)', flexShrink: 0, flexWrap: 'wrap' },
  closeBtn: { background: 'transparent', border: 'none', color: 'var(--text-3)', cursor: 'pointer', padding: 6, borderRadius: 6, display: 'inline-flex' },
  fieldLabel: { display: 'block', fontSize: 10.5, color: 'var(--text-3)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6 },
  textInput: { width: '100%', boxSizing: 'border-box', background: 'var(--bg-2)', border: '1px solid var(--line-2)', borderRadius: 7, padding: '9px 10px', color: 'var(--text-1)', fontFamily: 'inherit', fontSize: 13.5, outline: 'none' },
  chip: { padding: '7px 12px', borderRadius: 999, border: '1px solid var(--line-2)', background: 'var(--bg-2)', color: 'var(--text-2)', fontFamily: 'inherit', fontSize: 12.5, cursor: 'pointer' },
  chipOn: { background: 'var(--accent-soft)', border: '1px solid var(--accent)', color: 'var(--text-1)' },
  linkBtn: { background: 'transparent', border: 'none', color: 'var(--accent)', fontSize: 12, fontFamily: 'inherit', cursor: 'pointer', padding: 0 },
  miniBtn: { display: 'inline-flex', alignItems: 'center', gap: 4, padding: '7px 12px', background: 'transparent', border: '1px solid var(--line-2)', color: 'var(--text-2)', borderRadius: 7, fontSize: 12.5, fontFamily: 'inherit', cursor: 'pointer' },
  primaryBtn: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', background: 'var(--accent)', border: 'none', color: '#fff', borderRadius: 7, fontSize: 13, fontWeight: 500, fontFamily: 'inherit', cursor: 'pointer' },
  alert: { padding: '10px 14px', borderRadius: 8, fontSize: 13 },
};
