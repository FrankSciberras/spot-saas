'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './AdminForms.module.css';

interface PartialStaff {
  id?: string;
  email?: string;
  full_name?: string | null;
  role?: string;
}

interface ExistingStaffAccount {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
}

interface StaffFormProps {
  staff?: PartialStaff;
  mode: 'create' | 'edit';
  existingAccounts?: ExistingStaffAccount[];
}

export default function StaffForm({ staff, mode, existingAccounts = [] }: StaffFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [createMethod, setCreateMethod] = useState<'new' | 'existing'>('new');
  const [selectedExistingId, setSelectedExistingId] = useState('');

  const [formData, setFormData] = useState({
    email: staff?.email || '',
    full_name: staff?.full_name || '',
    password: '',
    confirmPassword: '',
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      if (mode === 'create') {
        if (createMethod === 'existing') {
          if (!selectedExistingId) {
            throw new Error('Please select an existing account');
          }

          const res = await fetch(`/api/users/${selectedExistingId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ also_staff: true }),
          });

          const data = await res.json();

          if (!res.ok) {
            throw new Error(data.error || 'Failed to grant staff access');
          }

          setSuccess('Staff access granted successfully!');
          setTimeout(() => {
            router.push('/fleet/staff');
            router.refresh();
          }, 1000);

          return;
        }

        // Validate for create mode
        if (!formData.email) {
          throw new Error('Email is required to invite staff');
        }

        // Invite staff member into the active fleet (they set their own password)
        const res = await fetch('/api/members/invite', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: formData.email,
            full_name: formData.full_name,
            role: 'staff',
          }),
        });

        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error || 'Failed to invite staff member');
        }

        setSuccess('Staff invitation sent!');
        setTimeout(() => {
          router.push('/fleet/staff');
          router.refresh();
        }, 1000);
      } else {
        // Update existing staff
        const updateData: Record<string, string | undefined> = {
          full_name: formData.full_name,
        };

        // Only include password if it's being changed
        if (formData.password) {
          if (formData.password !== formData.confirmPassword) {
            throw new Error('Passwords do not match');
          }
          if (formData.password.length < 6) {
            throw new Error('Password must be at least 6 characters');
          }
          updateData.password = formData.password;
        }

        const res = await fetch(`/api/users/${staff?.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updateData),
        });

        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error || 'Failed to update staff member');
        }

        setSuccess('Staff member updated successfully!');
        setTimeout(() => {
          router.push('/fleet/staff');
          router.refresh();
        }, 1000);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const selectedExistingAccount = existingAccounts.find((account) => account.id === selectedExistingId);

  return (
    <form onSubmit={handleSubmit} className={styles.form}>
      {error && (
        <div className="alert alert-danger">
          {error}
        </div>
      )}

      {success && (
        <div className="alert alert-success">
          {success}
        </div>
      )}

      {mode === 'create' && (
        <div className={styles.formSection}>
          <h3>How do you want to add staff?</h3>
          <div className={styles.optionGrid}>
            <button
              type="button"
              className={`${styles.optionCard} ${createMethod === 'new' ? styles.optionCardActive : ''}`}
              onClick={() => setCreateMethod('new')}
            >
              <span className={styles.optionTitle}>Invite new staff member</span>
              <span className={styles.optionDescription}>Email an invite; they set their own password and join your fleet.</span>
            </button>

            <button
              type="button"
              className={`${styles.optionCard} ${createMethod === 'existing' ? styles.optionCardActive : ''}`}
              onClick={() => setCreateMethod('existing')}
              disabled={existingAccounts.length === 0}
            >
              <span className={styles.optionTitle}>Use existing driver account</span>
              <span className={styles.optionDescription}>
                Grant staff access to a current driver account without creating a new login.
              </span>
            </button>
          </div>
        </div>
      )}

      <div className={styles.formSection}>
        <h3>Account Information</h3>
        <div className={styles.formGrid}>
          {mode === 'create' && createMethod === 'existing' ? (
            <>
              <div className={styles.formGroup}>
                <label htmlFor="existingAccount">Select Existing Driver Account *</label>
                <select
                  id="existingAccount"
                  name="existingAccount"
                  value={selectedExistingId}
                  onChange={(e) => setSelectedExistingId(e.target.value)}
                  required
                >
                  <option value="">Choose a driver account...</option>
                  {existingAccounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {(account.full_name || account.email)} — {account.email}
                    </option>
                  ))}
                </select>
                <span className={styles.helpText}>
                  This keeps their driver access and adds staff dashboard access.
                </span>
              </div>

              <div className={styles.readOnlyCard}>
                <div className={styles.detailItem}>
                  <div className={styles.detailLabel}>Selected Account</div>
                  <div className={styles.detailValue}>{selectedExistingAccount?.full_name || '-'}</div>
                </div>
                <div className={styles.detailItem}>
                  <div className={styles.detailLabel}>Email</div>
                  <div className={styles.detailValue}>{selectedExistingAccount?.email || '-'}</div>
                </div>
                <div className={styles.detailItem}>
                  <div className={styles.detailLabel}>Current Role</div>
                  <div className={styles.detailValue}>{selectedExistingAccount?.role || '-'}</div>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className={styles.formGroup}>
                <label htmlFor="email">Email Address *</label>
                <input
                  type="email"
                  id="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  placeholder="staff@example.com"
                  required
                  disabled={mode === 'edit'}
                />
                {mode === 'edit' && (
                  <span className={styles.helpText}>Email cannot be changed</span>
                )}
              </div>

              <div className={styles.formGroup}>
                <label htmlFor="full_name">Full Name</label>
                <input
                  type="text"
                  id="full_name"
                  name="full_name"
                  value={formData.full_name}
                  onChange={handleChange}
                  placeholder="Enter full name"
                />
              </div>

              {mode === 'create' ? (
                <div className={styles.formGroup}>
                  <span className={styles.helpText}>
                    We&apos;ll email this person an invite to set their own password and join your fleet as staff.
                  </span>
                </div>
              ) : (
                <>
                  <div className={styles.formGroup}>
                    <label htmlFor="password">New Password</label>
                    <input
                      type="password"
                      id="password"
                      name="password"
                      value={formData.password}
                      onChange={handleChange}
                      placeholder="Leave blank to keep current"
                      minLength={6}
                    />
                    <span className={styles.helpText}>Leave blank to keep current password</span>
                  </div>

                  <div className={styles.formGroup}>
                    <label htmlFor="confirmPassword">Confirm New Password</label>
                    <input
                      type="password"
                      id="confirmPassword"
                      name="confirmPassword"
                      value={formData.confirmPassword}
                      onChange={handleChange}
                      placeholder="Confirm password"
                      required={formData.password.length > 0}
                    />
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>

      <div className={styles.formActions}>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => router.back()}
          disabled={loading}
        >
          Cancel
        </button>
        <button
          type="submit"
          className="btn btn-primary"
          disabled={loading}
        >
          {loading
            ? 'Saving...'
            : mode === 'create'
              ? createMethod === 'existing'
                ? 'Grant Staff Access'
                : 'Create Staff'
              : 'Save Changes'}
        </button>
      </div>
    </form>
  );
}
