'use client';

import { useState, useEffect } from 'react';
import FleetShell from '@/components/fleet/FleetShell';
import { SessionUser, RolePermission } from '@/lib/types/database';
import styles from './permissions.module.css';

const RESOURCE_INFO: Record<string, { label: string; icon: string; description: string }> = {
  dashboard: { label: 'Dashboard', icon: '📊', description: 'View dashboard and statistics' },
  drivers: { label: 'Drivers', icon: '👤', description: 'Manage driver profiles and documents' },
  vehicles: { label: 'Vehicles', icon: '🚗', description: 'Manage vehicle fleet' },
  shifts: { label: 'Shifts', icon: '⏰', description: 'View and manage work shifts' },
  rosters: { label: 'Rosters', icon: '📅', description: 'Manage weekly rosters' },
  services: { label: 'Services', icon: '🔧', description: 'Vehicle service records' },
  damages: { label: 'Damages', icon: '⚠️', description: 'Vehicle damage tracking and reports' },
  notifications: { label: 'Notifications', icon: '🔔', description: 'Send and manage notifications' },
  reports: { label: 'Reports', icon: '📈', description: 'View and export reports' },
  settings: { label: 'Settings', icon: '⚙️', description: 'System settings and configuration' },
};

RESOURCE_INFO.reminders = {
  label: 'Reminders',
  icon: '✓',
  description: 'View and manage reminders and to-dos',
};

const ROLE_INFO: Record<string, { label: string; color: string; description: string }> = {
  staff: { 
    label: 'Staff', 
    color: '#8b5cf6',
    description: 'Staff members who help manage operations'
  },
  driver: { 
    label: 'Driver', 
    color: '#3b82f6',
    description: 'Drivers who use the mobile app'
  },
};

export default function PermissionsPage() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [permissions, setPermissions] = useState<RolePermission[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [activeRole, setActiveRole] = useState<string>('staff');
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      // Fetch current user
      const userRes = await fetch('/api/auth/user');
      const userData = await userRes.json();
      console.log("userData", userData)
      setUser(userData);

      // Fetch permissions
      const permRes = await fetch('/api/permissions');
      if (permRes.ok) {
        const permData = await permRes.json();
        setPermissions(permData);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
      showMessage('error', 'Failed to load permissions');
    } finally {
      setLoading(false);
    }
  };

  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 4000);
  };

  const togglePermission = (permId: string, field: keyof RolePermission) => {
    setPermissions(prev => 
      prev.map(p => {
        if (p.id === permId) {
          return { ...p, [field]: !p[field] };
        }
        return p;
      })
    );
    setHasChanges(true);
  };

  const toggleAllForResource = (resource: string, field: keyof RolePermission) => {
    const rolePerms = permissions.filter(p => p.role === activeRole && p.resource === resource);
    const allEnabled = rolePerms.every(p => p[field]);
    
    setPermissions(prev =>
      prev.map(p => {
        if (p.role === activeRole && p.resource === resource) {
          return { ...p, [field]: !allEnabled };
        }
        return p;
      })
    );
    setHasChanges(true);
  };

  const setAllPermissions = (role: string, value: boolean) => {
    setPermissions(prev =>
      prev.map(p => {
        if (p.role === role) {
          return {
            ...p,
            can_view: value,
            can_create: value,
            can_edit: value,
            can_delete: value,
          };
        }
        return p;
      })
    );
    setHasChanges(true);
  };

  const savePermissions = async () => {
    setSaving(true);
    try {
      const rolePerms = permissions.filter(p => p.role === activeRole);
      
      const res = await fetch('/api/permissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ permissions: rolePerms }),
      });

      if (res.ok) {
        showMessage('success', `${ROLE_INFO[activeRole].label} permissions saved successfully`);
        setHasChanges(false);
      } else {
        throw new Error('Failed to save');
      }
    } catch (error) {
      console.error('Error saving permissions:', error);
      showMessage('error', 'Failed to save permissions');
    } finally {
      setSaving(false);
    }
  };

  const rolePermissions = permissions.filter(p => p.role === activeRole);

  if (loading || !user) {
    return (
      <FleetShell user={user as SessionUser} title="Permissions">
        <div className={styles.loading}>Loading permissions...</div>
      </FleetShell>
    );
  }

  return (
    <FleetShell user={user} title="Role Permissions">
      <div className={styles.container}>
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.headerContent}>
            <h1>Role Permissions</h1>
            <p>Configure what each role can see and do in the system</p>
          </div>
          {hasChanges && (
            <button 
              className="btn btn-primary"
              onClick={savePermissions}
              disabled={saving}
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          )}
        </div>

        {/* Message */}
        {message && (
          <div className={`${styles.message} ${styles[message.type]}`}>
            {message.text}
          </div>
        )}

        {/* Role Tabs */}
        <div className={styles.roleTabs}>
          {Object.entries(ROLE_INFO).map(([role, info]) => (
            <button
              key={role}
              className={`${styles.roleTab} ${activeRole === role ? styles.active : ''}`}
              onClick={() => setActiveRole(role)}
              style={{ '--role-color': info.color } as React.CSSProperties}
            >
              <span className={styles.roleLabel}>{info.label}</span>
              <span className={styles.roleDescription}>{info.description}</span>
            </button>
          ))}
        </div>

        {/* Quick Actions */}
        <div className={styles.quickActions}>
          <span>Quick actions:</span>
          <button 
            className={styles.quickBtn}
            onClick={() => setAllPermissions(activeRole, true)}
          >
            Enable All
          </button>
          <button 
            className={styles.quickBtn}
            onClick={() => setAllPermissions(activeRole, false)}
          >
            Disable All
          </button>
        </div>

        {/* Permissions Table */}
        <div className={styles.tableWrapper}>
          <table className={styles.permissionsTable}>
            <thead>
              <tr>
                <th className={styles.resourceCol}>Resource</th>
                <th className={styles.permCol}>
                  <div className={styles.permHeader}>
                    <span>👁️ View</span>
                  </div>
                </th>
                <th className={styles.permCol}>
                  <div className={styles.permHeader}>
                    <span>➕ Create</span>
                  </div>
                </th>
                <th className={styles.permCol}>
                  <div className={styles.permHeader}>
                    <span>✏️ Edit</span>
                  </div>
                </th>
                <th className={styles.permCol}>
                  <div className={styles.permHeader}>
                    <span>🗑️ Delete</span>
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              {rolePermissions.map(perm => {
                const resourceInfo = RESOURCE_INFO[perm.resource] || { 
                  label: perm.resource, 
                  icon: '📄', 
                  description: '' 
                };
                
                return (
                  <tr key={perm.id}>
                    <td className={styles.resourceCell}>
                      <div className={styles.resourceInfo}>
                        <span className={styles.resourceIcon}>{resourceInfo.icon}</span>
                        <div>
                          <span className={styles.resourceName}>{resourceInfo.label}</span>
                          <span className={styles.resourceDesc}>{resourceInfo.description}</span>
                        </div>
                      </div>
                    </td>
                    <td className={styles.permCell}>
                      <label className={styles.toggle}>
                        <input
                          type="checkbox"
                          checked={perm.can_view}
                          onChange={() => togglePermission(perm.id, 'can_view')}
                        />
                        <span className={styles.toggleSlider}></span>
                      </label>
                    </td>
                    <td className={styles.permCell}>
                      <label className={styles.toggle}>
                        <input
                          type="checkbox"
                          checked={perm.can_create}
                          onChange={() => togglePermission(perm.id, 'can_create')}
                        />
                        <span className={styles.toggleSlider}></span>
                      </label>
                    </td>
                    <td className={styles.permCell}>
                      <label className={styles.toggle}>
                        <input
                          type="checkbox"
                          checked={perm.can_edit}
                          onChange={() => togglePermission(perm.id, 'can_edit')}
                        />
                        <span className={styles.toggleSlider}></span>
                      </label>
                    </td>
                    <td className={styles.permCell}>
                      <label className={styles.toggle}>
                        <input
                          type="checkbox"
                          checked={perm.can_delete}
                          onChange={() => togglePermission(perm.id, 'can_delete')}
                        />
                        <span className={styles.toggleSlider}></span>
                      </label>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Legend */}
        <div className={styles.legend}>
          <div className={styles.legendItem}>
            <span className={styles.legendIcon}>👁️</span>
            <span><strong>View</strong> - Can see the page and data</span>
          </div>
          <div className={styles.legendItem}>
            <span className={styles.legendIcon}>➕</span>
            <span><strong>Create</strong> - Can add new records</span>
          </div>
          <div className={styles.legendItem}>
            <span className={styles.legendIcon}>✏️</span>
            <span><strong>Edit</strong> - Can modify existing records</span>
          </div>
          <div className={styles.legendItem}>
            <span className={styles.legendIcon}>🗑️</span>
            <span><strong>Delete</strong> - Can remove records</span>
          </div>
        </div>

        {/* Note */}
        <div className={styles.note}>
          <strong>Note:</strong> Admin users always have full access to all features. 
          These permissions only apply to Staff and Driver roles.
        </div>
      </div>
    </FleetShell>
  );
}
