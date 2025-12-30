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

interface StaffFormProps {
  staff?: PartialStaff;
  mode: 'create' | 'edit';
}

export default function StaffForm({ staff, mode }: StaffFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

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
        // Validate for create mode
        if (!formData.email || !formData.password) {
          throw new Error('Email and password are required');
        }
        if (formData.password !== formData.confirmPassword) {
          throw new Error('Passwords do not match');
        }
        if (formData.password.length < 6) {
          throw new Error('Password must be at least 6 characters');
        }

        // Create user with staff role
        const res = await fetch('/api/users/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: formData.email,
            password: formData.password,
            full_name: formData.full_name,
            role: 'staff',
          }),
        });

        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error || 'Failed to create staff account');
        }

        setSuccess('Staff member created successfully!');
        setTimeout(() => {
          router.push('/admin/staff');
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
          router.push('/admin/staff');
          router.refresh();
        }, 1000);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

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

      {/* Account Information Section */}
      <div className={styles.formSection}>
        <h3>Account Information</h3>
        <div className={styles.formGrid}>
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

          <div className={styles.formGroup}>
            <label htmlFor="password">
              {mode === 'create' ? 'Password *' : 'New Password'}
            </label>
            <input
              type="password"
              id="password"
              name="password"
              value={formData.password}
              onChange={handleChange}
              placeholder={mode === 'create' ? 'Minimum 6 characters' : 'Leave blank to keep current'}
              minLength={6}
              required={mode === 'create'}
            />
            {mode === 'edit' && (
              <span className={styles.helpText}>Leave blank to keep current password</span>
            )}
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="confirmPassword">
              {mode === 'create' ? 'Confirm Password *' : 'Confirm New Password'}
            </label>
            <input
              type="password"
              id="confirmPassword"
              name="confirmPassword"
              value={formData.confirmPassword}
              onChange={handleChange}
              placeholder="Confirm password"
              required={mode === 'create' || formData.password.length > 0}
            />
          </div>
        </div>
      </div>

      {/* Form Actions */}
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
          {loading ? 'Saving...' : mode === 'create' ? 'Create Staff' : 'Save Changes'}
        </button>
      </div>
    </form>
  );
}
