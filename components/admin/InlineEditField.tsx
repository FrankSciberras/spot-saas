'use client';

import { useState, useRef, useEffect } from 'react';
import styles from './InlineEdit.module.css';

interface InlineEditFieldProps {
  label: string;
  value: string | null | undefined;
  fieldName: string;
  type?: 'text' | 'date' | 'tel' | 'select' | 'textarea';
  options?: { value: string; label: string }[];
  onSave: (fieldName: string, value: string) => Promise<boolean>;
  expiryClass?: string;
  expiryLabel?: string;
  placeholder?: string;
  uploadButton?: React.ReactNode;
  fileList?: React.ReactNode;
}

export default function InlineEditField({
  label,
  value,
  fieldName,
  type = 'text',
  options,
  onSave,
  expiryClass,
  expiryLabel,
  placeholder,
  uploadButton,
  fileList,
}: InlineEditFieldProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(value || '');
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isEditing]);

  const handleEdit = () => {
    setEditValue(value || '');
    setIsEditing(true);
  };

  const handleCancel = () => {
    setEditValue(value || '');
    setIsEditing(false);
  };

  const handleSave = async () => {
    setSaving(true);
    const success = await onSave(fieldName, editValue);
    setSaving(false);
    if (success) {
      setIsEditing(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && type !== 'textarea') {
      e.preventDefault();
      handleSave();
    } else if (e.key === 'Escape') {
      handleCancel();
    }
  };

  const displayValue = value || <span className={styles.empty}>{placeholder || 'Not set'}</span>;

  if (isEditing) {
    return (
      <div className={styles.fieldContainer}>
        <span className={styles.label}>{label}</span>
        <div className={styles.editRow}>
          {type === 'select' && options ? (
            <select
              ref={inputRef as React.RefObject<HTMLSelectElement>}
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={handleKeyDown}
              className={styles.input}
            >
              {options.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          ) : type === 'textarea' ? (
            <textarea
              ref={inputRef as React.RefObject<HTMLTextAreaElement>}
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={handleKeyDown}
              className={styles.input}
              rows={3}
            />
          ) : (
            <input
              ref={inputRef as React.RefObject<HTMLInputElement>}
              type={type}
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={handleKeyDown}
              className={styles.input}
            />
          )}
          <div className={styles.editActions}>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className={styles.saveBtn}
              title="Save"
            >
              {saving ? '...' : '✓'}
            </button>
            <button
              type="button"
              onClick={handleCancel}
              disabled={saving}
              className={styles.cancelBtn}
              title="Cancel"
            >
              ✕
            </button>
          </div>
          {uploadButton}
        </div>
        {fileList}
      </div>
    );
  }

  return (
    <div className={styles.fieldContainer}>
      <span className={styles.label}>{label}</span>
      <div className={styles.valueRow}>
        <span className={`${styles.value} ${expiryClass || ''}`}>
          {displayValue}
          {expiryLabel && <span className={styles.expiryLabel}>{expiryLabel}</span>}
        </span>
        <button
          type="button"
          onClick={handleEdit}
          className={styles.editBtn}
          title="Edit"
        >
          ✎
        </button>
        {uploadButton}
      </div>
      {fileList}
    </div>
  );
}
