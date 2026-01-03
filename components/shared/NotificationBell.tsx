"use client";

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import styles from './NotificationBell.module.css';

interface Notification {
  id: string;
  title: string;
  body: string;
  type: string;
  action_url?: string;
  created_at: string;
  read_at: string | null;
}

export default function NotificationBell() {
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchNotifications();
    
    // Poll for new notifications every 30 seconds
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchNotifications = async () => {
    try {
      const res = await fetch('/api/notifications?limit=10');
      if (res.ok) {
        const data = await res.json();
        // Ensure created_at has a fallback to sent_at for older notifications
        const notifications = (data.data || []).map((n: Notification & { sent_at?: string }) => ({
          ...n,
          created_at: n.created_at || n.sent_at || new Date().toISOString(),
        }));
        setNotifications(notifications);
        setUnreadCount(data.unread_count || 0);
      }
    } catch (error) {
      console.error('Failed to fetch notifications:', error);
    } finally {
      setLoading(false);
    }
  };

  const markAsRead = async (id: string) => {
    try {
      await fetch(`/api/notifications/${id}/read`, { method: 'POST' });
      setNotifications(prev => 
        prev.map(n => n.id === id ? { ...n, read_at: new Date().toISOString() } : n)
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (error) {
      console.error('Failed to mark as read:', error);
    }
  };

  const markAllAsRead = async () => {
    try {
      await fetch('/api/notifications/read-all', { method: 'POST' });
      setNotifications(prev => 
        prev.map(n => ({ ...n, read_at: new Date().toISOString() }))
      );
      setUnreadCount(0);
    } catch (error) {
      console.error('Failed to mark all as read:', error);
    }
  };

  const handleNotificationClick = (notification: Notification) => {
    if (!notification.read_at) {
      markAsRead(notification.id);
    }
    if (notification.action_url) {
      router.push(notification.action_url);
    }
    setIsOpen(false);
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
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

  return (
    <div className={styles.container} ref={dropdownRef} data-tour="notifications-bell">
      <button 
        className={styles.bellButton}
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Notifications"
      >
        <svg 
          viewBox="0 0 24 24" 
          stroke="currentColor" 
          strokeWidth="1.8" 
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M6 10a6 6 0 0 1 12 0c0 3 1.2 4.5 1.8 5.2A1 1 0 0 1 19 17H5a1 1 0 0 1-.8-1.8C4.8 14.5 6 13 6 10Z" />
          <path d="M10 19a2 2 0 0 0 4 0" />
        </svg>
        {unreadCount > 0 && (
          <span className={styles.badge}>
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className={styles.dropdown}>
          <div className={styles.dropdownHeader}>
            <h3>Notifications</h3>
            {unreadCount > 0 && (
              <button onClick={markAllAsRead} className={styles.markAllBtn}>
                Mark all read
              </button>
            )}
          </div>

          <div className={styles.notificationList}>
            {loading ? (
              <div className={styles.loading}>Loading...</div>
            ) : notifications.length === 0 ? (
              <div className={styles.empty}>
                <svg viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5" fill="none">
                  <path d="M6 10a6 6 0 0 1 12 0c0 3 1.2 4.5 1.8 5.2A1 1 0 0 1 19 17H5a1 1 0 0 1-.8-1.8C4.8 14.5 6 13 6 10Z" />
                  <path d="M10 19a2 2 0 0 0 4 0" />
                </svg>
                <p>No notifications</p>
              </div>
            ) : (
              notifications.map((notification) => (
                <button
                  key={notification.id}
                  className={`${styles.notificationItem} ${!notification.read_at ? styles.unread : ''}`}
                  onClick={() => handleNotificationClick(notification)}
                >
                  <div className={styles.notificationContent}>
                    <span className={styles.notificationTitle}>{notification.title}</span>
                    <span className={styles.notificationBody}>{notification.body}</span>
                    <span className={styles.notificationTime}>{formatTime(notification.created_at)}</span>
                  </div>
                  {!notification.read_at && <div className={styles.unreadDot} />}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
