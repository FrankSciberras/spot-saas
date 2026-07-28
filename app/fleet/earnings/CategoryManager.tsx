'use client';

import { type CSSProperties, useState, useMemo, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import FleetIcon from '@/components/fleet/FleetIcon';
import {
  CATEGORY_PRESETS,
  CATEGORY_COLORS,
  CATEGORY_ICONS,
  categoriesOfKind,
  type FinanceCategory,
  type CategoryKind,
} from '@/lib/config/financeCategories';
import {
  createFinanceCategoryAction,
  createFinanceCategoryFromPresetAction,
  updateFinanceCategoryAction,
  setFinanceCategoryActiveAction,
  deleteFinanceCategoryAction,
} from '@/lib/actions/finance-categories';

interface CategoryManagerProps {
  categories: FinanceCategory[];
  onClose: () => void;
}

const BLANK_DRAFT = { name: '', kind: 'expense' as CategoryKind, icon: 'dots', color: '#2bbd7e' };

export default function CategoryManager({ categories, onClose }: CategoryManagerProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState(BLANK_DRAFT);
  const [showAdd, setShowAdd] = useState(false);

  const income = useMemo(() => categoriesOfKind(categories, 'income', { includeInactive: true }), [categories]);
  const expense = useMemo(() => categoriesOfKind(categories, 'expense', { includeInactive: true }), [categories]);

  const existingKeys = useMemo(() => new Set(categories.map((c) => c.key)), [categories]);
  const availablePresets = useMemo(
    () => CATEGORY_PRESETS.filter((p) => !existingKeys.has(p.key)),
    [existingKeys],
  );

  const run = (fn: () => Promise<{ error?: string; ok?: boolean }>, onDone?: () => void) => {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (res.error) {
        setError(res.error);
        return;
      }
      onDone?.();
      router.refresh();
    });
  };

  const startEdit = (category: FinanceCategory) => {
    setEditingId(category.id);
    setShowAdd(false);
    setDraft({ name: category.name, kind: category.kind, icon: category.icon, color: category.color });
  };

  const startAdd = (kind: CategoryKind) => {
    setEditingId(null);
    setShowAdd(true);
    setDraft({ ...BLANK_DRAFT, kind });
  };

  const saveDraft = () => {
    if (editingId) {
      run(() => updateFinanceCategoryAction(editingId, draft), () => setEditingId(null));
    } else {
      run(() => createFinanceCategoryAction(draft), () => setShowAdd(false));
    }
  };

  const renderRow = (category: FinanceCategory) => {
    const isEditing = editingId === category.id;
    if (isEditing) return <div key={category.id} style={st.editRow}>{renderForm('Save changes')}</div>;

    return (
      <div key={category.id} style={{ ...st.row, opacity: category.isActive ? 1 : 0.5 }}>
        <span style={{ width: 10, height: 10, borderRadius: 3, background: category.color, flexShrink: 0 }} />
        <FleetIcon name={category.icon} size={13} />
        <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {category.name}
          {!category.isActive && <span style={{ color: 'var(--text-3)', fontSize: 11 }}> · hidden</span>}
        </span>
        <button style={st.iconBtn} onClick={() => startEdit(category)} disabled={pending} title="Rename or restyle">
          Edit
        </button>
        {!category.isSystem && (
          <button
            style={st.iconBtn}
            disabled={pending}
            onClick={() => run(() => setFinanceCategoryActiveAction(category.id, !category.isActive))}
            title={category.isActive ? 'Hide from new periods' : 'Show again'}
          >
            {category.isActive ? 'Hide' : 'Show'}
          </button>
        )}
        {!category.isSystem && (
          <button
            style={{ ...st.iconBtn, color: 'var(--neg)' }}
            disabled={pending}
            onClick={() => run(() => deleteFinanceCategoryAction(category.id))}
            title="Delete (only if never used)"
          >
            <FleetIcon name="close" size={12} />
          </button>
        )}
      </div>
    );
  };

  const renderForm = (submitLabel: string) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%' }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          autoFocus
          type="text"
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          placeholder="Category name"
          style={{ ...st.input, flex: '1 1 160px' }}
        />
        <select
          value={draft.icon}
          onChange={(e) => setDraft({ ...draft, icon: e.target.value })}
          style={{ ...st.input, width: 120 }}
        >
          {CATEGORY_ICONS.map((icon) => (
            <option key={icon} value={icon}>{icon}</option>
          ))}
        </select>
      </div>
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
        {CATEGORY_COLORS.map((color) => (
          <button
            key={color}
            onClick={() => setDraft({ ...draft, color })}
            title={color}
            style={{
              width: 20, height: 20, borderRadius: 5, background: color, cursor: 'pointer',
              border: draft.color === color ? '2px solid var(--text-1)' : '1px solid var(--line-2)',
            }}
          />
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button style={st.savePrimary} onClick={saveDraft} disabled={pending || !draft.name.trim()}>
          {pending ? 'Saving…' : submitLabel}
        </button>
        <button style={st.miniBtn} onClick={() => { setEditingId(null); setShowAdd(false); setError(null); }} disabled={pending}>
          Cancel
        </button>
      </div>
    </div>
  );

  const renderSection = (title: string, kind: CategoryKind, list: FinanceCategory[]) => (
    <div style={st.card}>
      <div style={{ ...st.cardHeader, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--text-1)' }}>{title}</div>
        <button style={st.linkBtn} onClick={() => startAdd(kind)} disabled={pending}>+ Add</button>
      </div>
      <div style={{ borderTop: '1px solid var(--line-1)' }}>
        {list.map(renderRow)}
        {showAdd && draft.kind === kind && !editingId && (
          <div style={st.editRow}>{renderForm('Add category')}</div>
        )}
      </div>
    </div>
  );

  return (
    <div style={st.overlay} onClick={onClose}>
      <div style={st.modal} onClick={(e) => e.stopPropagation()}>
        <div style={st.modalHead}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 500, color: 'var(--text-1)' }}>Bookkeeping categories</div>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
              Your own income and expense lines. Renaming keeps history intact.
            </div>
          </div>
          <button style={st.iconBtn} onClick={onClose}><FleetIcon name="close" size={14} /></button>
        </div>

        <div style={st.modalBody}>
          {error && (
            <div style={{ ...st.alert, color: 'var(--neg)', background: 'var(--neg-soft)', border: '1px solid rgba(240,100,100,0.25)' }}>
              {error}
            </div>
          )}

          {renderSection('Income', 'income', income)}
          {renderSection('Expenses', 'expense', expense)}

          {availablePresets.length > 0 && (
            <div style={st.card}>
              <div style={st.cardHeader}>
                <div style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--text-1)' }}>Common categories</div>
                <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>One click to add — the lines most fleets keep.</div>
              </div>
              <div style={{ padding: 14, borderTop: '1px solid var(--line-1)', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {availablePresets.map((preset) => (
                  <button
                    key={preset.key}
                    title={preset.hint}
                    disabled={pending}
                    onClick={() => run(() => createFinanceCategoryFromPresetAction(preset.key))}
                    style={st.presetChip}
                    className="fleetHover"
                  >
                    <span style={{ width: 8, height: 8, borderRadius: 2, background: preset.color }} />
                    <FleetIcon name={preset.icon} size={12} />
                    {preset.name}
                    <span style={{ color: 'var(--text-3)', fontSize: 10 }}>
                      {preset.kind === 'income' ? 'income' : 'expense'}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const st: Record<string, CSSProperties> = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 24, zIndex: 200, overflowY: 'auto' },
  modal: { width: '100%', maxWidth: 640, background: 'var(--bg-0)', border: '1px solid var(--line-1)', borderRadius: 'var(--radius-lg)', overflow: 'hidden', marginTop: 24 },
  modalHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '16px 18px', gap: 12, borderBottom: '1px solid var(--line-1)' },
  modalBody: { padding: 16, display: 'flex', flexDirection: 'column', gap: 14, maxHeight: '70vh', overflowY: 'auto' },
  card: { background: 'var(--bg-1)', border: '1px solid var(--line-1)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' },
  cardHeader: { padding: '12px 14px' },
  row: { display: 'flex', alignItems: 'center', gap: 8, padding: '9px 14px', borderBottom: '1px solid var(--line-1)' },
  editRow: { display: 'flex', padding: '12px 14px', borderBottom: '1px solid var(--line-1)', background: 'var(--bg-2)' },
  input: { boxSizing: 'border-box', background: 'var(--bg-1)', border: '1px solid var(--line-2)', borderRadius: 7, padding: '7px 9px', color: 'var(--text-1)', fontFamily: 'inherit', fontSize: 13, outline: 'none' },
  iconBtn: { display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 8px', background: 'transparent', border: '1px solid var(--line-2)', color: 'var(--text-2)', borderRadius: 6, fontSize: 11.5, fontFamily: 'inherit', cursor: 'pointer' },
  miniBtn: { display: 'inline-flex', alignItems: 'center', gap: 4, padding: '6px 12px', background: 'transparent', border: '1px solid var(--line-2)', color: 'var(--text-2)', borderRadius: 6, fontSize: 12, fontFamily: 'inherit', cursor: 'pointer' },
  savePrimary: { display: 'inline-flex', alignItems: 'center', gap: 4, padding: '6px 14px', background: 'var(--accent)', border: 'none', color: '#fff', borderRadius: 6, fontSize: 12.5, fontWeight: 500, fontFamily: 'inherit', cursor: 'pointer' },
  linkBtn: { background: 'transparent', border: 'none', color: 'var(--accent)', fontSize: 12, fontFamily: 'inherit', cursor: 'pointer', padding: 0 },
  presetChip: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 10px', background: 'var(--bg-2)', border: '1px solid var(--line-2)', borderRadius: 20, color: 'var(--text-1)', fontSize: 12, fontFamily: 'inherit', cursor: 'pointer' },
  alert: { padding: '10px 14px', borderRadius: 8, fontSize: 13 },
};
