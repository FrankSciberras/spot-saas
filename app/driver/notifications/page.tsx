'use client';

import { useState, useEffect, useCallback } from 'react';
import FleetShell from '@/components/fleet/FleetShell';
import { SessionUser } from '@/lib/types/database';
import { useRouter } from 'next/navigation';
import styles from './notifications.module.css';

interface Notification {
  id: string;
  title: string;
  body: string;
  action_url?: string;
  source?: string;
  sender_label?: string | null;
  is_read: boolean;
  created_at: string;
}

const platformBadgeStyle: React.CSSProperties = {
  fontSize: 9.5, fontWeight: 600, letterSpacing: '0.03em', textTransform: 'uppercase',
  padding: '1px 6px', borderRadius: 100, marginLeft: 6, verticalAlign: 'middle',
  color: 'var(--accent, #2bbd7e)', background: 'var(--accent-soft, rgba(43, 189, 126,0.14))',
};

export default function NotificationsPage() {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications');
      if (res.ok) {
        const response = await res.json();
        // API returns { data, unread_count } - extract the array and map fields
        const notificationData = (response.data || response || []).map((n: Record<string, unknown>) => ({
          ...n,
          is_read: n.read_at != null,
          created_at: n.created_at || n.sent_at,
        }));
        setNotifications(notificationData);
      }
    } catch (error) {
      console.error('Error fetching notifications:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const userRes = await fetch('/api/auth/user');
        const userData = await userRes.json();
        setUser(userData);
        await fetchNotifications();
      } catch (error) {
        console.error('Error:', error);
        setLoading(false);
      }
    };
    fetchData();
  }, [fetchNotifications]);

  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 3000);
  };

  const markAsRead = async (id: string) => {
    try {
      const res = await fetch(`/api/notifications/${id}/read`, { method: 'POST' });
      if (res.ok) {
        setNotifications(prev =>
          prev.map(n => n.id === id ? { ...n, is_read: true } : n)
        );
      }
    } catch (error) {
      console.error('Error marking as read:', error);
    }
  };

  const markAllAsRead = async () => {
    try {
      const res = await fetch('/api/notifications/mark-all-read', { method: 'POST' });
      if (res.ok) {
        setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
        showMessage('success', 'All notifications marked as read');
      }
    } catch (error) {
      console.error('Error:', error);
      showMessage('error', 'Failed to mark all as read');
    }
  };

  const deleteNotification = async (id: string) => {
    try {
      const res = await fetch(`/api/notifications/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setNotifications(prev => prev.filter(n => n.id !== id));
        showMessage('success', 'Notification deleted');
      }
    } catch (error) {
      console.error('Error:', error);
      showMessage('error', 'Failed to delete notification');
    }
  };

  const deleteSelected = async () => {
    if (selectedIds.length === 0) return;
    
    try {
      const res = await fetch('/api/notifications/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: selectedIds }),
      });
      
      if (res.ok) {
        setNotifications(prev => prev.filter(n => !selectedIds.includes(n.id)));
        setSelectedIds([]);
        showMessage('success', `${selectedIds.length} notifications deleted`);
      }
    } catch (error) {
      console.error('Error:', error);
      showMessage('error', 'Failed to delete notifications');
    }
  };

  const handleNotificationClick = async (notification: Notification) => {
    if (!notification.is_read) {
      await markAsRead(notification.id);
    }
    if (notification.action_url) {
      router.push(notification.action_url);
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const selectAll = () => {
    const filtered = filteredNotifications;
    if (selectedIds.length === filtered.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filtered.map(n => n.id));
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  };

  const filteredNotifications = filter === 'unread' 
    ? notifications.filter(n => !n.is_read)
    : notifications;

  const unreadCount = notifications.filter(n => !n.is_read).length;

  if (loading || !user) {
    return (
      <FleetShell user={user as SessionUser} variant="driver" title="Notifications">
        <div className={styles.loading}>Loading notifications...</div>
      </FleetShell>
    );
  }

  return (
    <FleetShell user={user} variant="driver" title="Notifications">
      <div className={styles.container}>
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.headerContent}>
            <h1>Notifications</h1>
            {unreadCount > 0 && (
              <span className={styles.unreadBadge}>{unreadCount} unread</span>
            )}
          </div>
          <div className={styles.headerActions}>
            {unreadCount > 0 && (
              <button className={styles.markAllBtn} onClick={markAllAsRead}>
                ✓ Mark all as read
              </button>
            )}
          </div>
        </div>

        {/* Message */}
        {message && (
          <div className={`${styles.message} ${styles[message.type]}`}>
            {message.text}
          </div>
        )}

        {/* Filters & Actions Bar */}
        <div className={styles.toolbar}>
          <div className={styles.filters}>
            <button
              className={`${styles.filterBtn} ${filter === 'all' ? styles.active : ''}`}
              onClick={() => setFilter('all')}
            >
              All ({notifications.length})
            </button>
            <button
              className={`${styles.filterBtn} ${filter === 'unread' ? styles.active : ''}`}
              onClick={() => setFilter('unread')}
            >
              Unread ({unreadCount})
            </button>
          </div>
          
          {selectedIds.length > 0 && (
            <div className={styles.bulkActions}>
              <span className={styles.selectedCount}>{selectedIds.length} selected</span>
              <button className={styles.deleteBtn} onClick={deleteSelected}>
                🗑️ Delete
              </button>
            </div>
          )}
        </div>

        {/* Select All */}
        {filteredNotifications.length > 0 && (
          <div className={styles.selectAllBar}>
            <label className={styles.checkbox}>
              <input
                type="checkbox"
                checked={selectedIds.length === filteredNotifications.length && filteredNotifications.length > 0}
                onChange={selectAll}
              />
              <span>Select all</span>
            </label>
          </div>
        )}

        {/* Notifications List */}
        <div className={styles.notificationsList}>
          {filteredNotifications.length === 0 ? (
            <div className={styles.emptyState}>
              <div className={styles.emptyIcon}>🔔</div>
              <h3>No notifications</h3>
              <p>{filter === 'unread' ? 'You have no unread notifications' : 'You don\'t have any notifications yet'}</p>
            </div>
          ) : (
            filteredNotifications.map(notification => (
              <div
                key={notification.id}
                className={`${styles.notificationCard} ${!notification.is_read ? styles.unread : ''} ${selectedIds.includes(notification.id) ? styles.selected : ''}`}
              >
                <div className={styles.selectCol}>
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(notification.id)}
                    onChange={() => toggleSelect(notification.id)}
                    onClick={e => e.stopPropagation()}
                  />
                </div>
                
                <div 
                  className={styles.notificationContent}
                  onClick={() => handleNotificationClick(notification)}
                >
                  <div className={styles.notificationHeader}>
                    <h4 className={styles.notificationTitle}>
                      {!notification.is_read && <span className={styles.unreadDot} />}
                      {notification.title}
                      {notification.source === 'platform' && (
                        <span style={platformBadgeStyle}>{notification.sender_label || 'Rovora HQ'}</span>
                      )}
                    </h4>
                    <span className={styles.notificationTime}>{formatDate(notification.created_at)}</span>
                  </div>
                  <p className={styles.notificationBody}>{notification.body}</p>
                  {notification.action_url && (
                    <span className={styles.actionLink}>
                      Click to view →
                    </span>
                  )}
                </div>

                <div className={styles.notificationActions}>
                  {!notification.is_read && (
                    <button
                      className={styles.actionBtn}
                      onClick={(e) => { e.stopPropagation(); markAsRead(notification.id); }}
                      title="Mark as read"
                    >
                      ✓
                    </button>
                  )}
                  <button
                    className={`${styles.actionBtn} ${styles.deleteAction}`}
                    onClick={(e) => { e.stopPropagation(); deleteNotification(notification.id); }}
                    title="Delete"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </FleetShell>
  );
}
