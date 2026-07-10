'use client';

import { useState } from 'react';
import styles from './NotificationManager.module.css';

interface NotificationRule {
  id: string;
  name: string;
  description: string | null;
  trigger_type: string;
  channel: string;
  is_active: boolean;
  trigger_config: Record<string, unknown>;
  title_template: string;
  body_template: string;
  target_role: string;
}

interface NotificationLog {
  id: string;
  channel: string;
  title: string;
  body: string;
  status: string;
  created_at: string;
  metadata: Record<string, unknown>;
}

interface Driver {
  id: string;
  full_name: string;
  status: string;
}

interface NotificationManagerProps {
  initialRules: NotificationRule[];
  initialLogs: NotificationLog[];
  drivers: Driver[];
}

const TRIGGER_TYPES = [
  { value: 'roster_published', label: 'Roster Published' },
  { value: 'roster_updated', label: 'Roster Updated' },
  { value: 'shift_reminder', label: 'Shift Reminder' },
  { value: 'document_expiry', label: 'Document Expiry' },
  { value: 'service_due', label: 'Service Due' },
  { value: 'weekly_summary', label: 'Weekly Summary' },
  { value: 'custom', label: 'Custom' },
];

const CHANNELS = [
  { value: 'app', label: 'Dashboard Only' },
  { value: 'push', label: 'Push Notification' },
  { value: 'email', label: 'Email' },
  { value: 'all', label: 'All Channels' },
];

const TARGET_ROLES = [
  { value: 'driver', label: 'Drivers' },
  { value: 'admin', label: 'Admins & Staff' },
  { value: 'all', label: 'Everyone' },
];

const ACTION_PAGES = [
  { value: '', label: 'No link (default)' },
  { value: '/driver/roster', label: 'Driver Roster' },
  { value: '/driver/profile', label: 'Driver Profile' },
  { value: '/driver/notifications', label: 'Driver Notifications' },
  { value: '/driver/go-online', label: 'Go Online' },
  { value: '/fleet/rosters', label: 'Admin Rosters' },
  { value: '/fleet/drivers', label: 'Admin Drivers' },
  { value: '/fleet/vehicles', label: 'Admin Vehicles' },
  { value: '/fleet/services', label: 'Admin Services' },
];

export default function NotificationManager({ 
  initialRules, 
  initialLogs,
  drivers
}: NotificationManagerProps) {
  const [activeTab, setActiveTab] = useState<'rules' | 'send' | 'history'>('rules');
  const [rules, setRules] = useState(initialRules);
  const [logs] = useState(initialLogs);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Edit rule modal state
  const [editingRule, setEditingRule] = useState<NotificationRule | null>(null);
  const [showRuleModal, setShowRuleModal] = useState(false);

  // Send notification form state
  const [sendForm, setSendForm] = useState({
    title: '',
    message: '',
    action_url: '',
    channels: ['app'] as string[],
    recipients: 'all_drivers',
    specific_ids: [] as string[],
  });

  // Rule form state
  const [ruleForm, setRuleForm] = useState({
    name: '',
    description: '',
    trigger_type: 'custom',
    channel: 'app',
    is_active: true,
    title_template: '',
    body_template: '',
    target_role: 'driver',
    trigger_config: {} as Record<string, unknown>,
  });

  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 5000);
  };

  // Toggle rule active status
  const toggleRuleActive = async (rule: NotificationRule) => {
    try {
      const res = await fetch(`/api/notification-rules/${rule.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...rule, is_active: !rule.is_active }),
      });

      if (res.ok) {
        setRules(rules.map(r => 
          r.id === rule.id ? { ...r, is_active: !r.is_active } : r
        ));
        showMessage('success', `Rule ${!rule.is_active ? 'enabled' : 'disabled'}`);
      }
    } catch {
      showMessage('error', 'Failed to update rule');
    }
  };

  // Delete rule
  const deleteRule = async (ruleId: string) => {
    if (!confirm('Are you sure you want to delete this notification rule?')) return;

    try {
      const res = await fetch(`/api/notification-rules/${ruleId}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        setRules(rules.filter(r => r.id !== ruleId));
        showMessage('success', 'Rule deleted');
      }
    } catch {
      showMessage('error', 'Failed to delete rule');
    }
  };

  // Open edit modal
  const openEditModal = (rule?: NotificationRule) => {
    if (rule) {
      setEditingRule(rule);
      setRuleForm({
        name: rule.name,
        description: rule.description || '',
        trigger_type: rule.trigger_type,
        channel: rule.channel,
        is_active: rule.is_active,
        title_template: rule.title_template,
        body_template: rule.body_template,
        target_role: rule.target_role,
        trigger_config: rule.trigger_config || {},
      });
    } else {
      setEditingRule(null);
      setRuleForm({
        name: '',
        description: '',
        trigger_type: 'custom',
        channel: 'app',
        is_active: true,
        title_template: '',
        body_template: '',
        target_role: 'driver',
        trigger_config: {},
      });
    }
    setShowRuleModal(true);
  };

  // Save rule
  const saveRule = async () => {
    if (!ruleForm.name || !ruleForm.title_template || !ruleForm.body_template) {
      showMessage('error', 'Please fill in all required fields');
      return;
    }

    setLoading(true);
    try {
      const url = editingRule 
        ? `/api/notification-rules/${editingRule.id}`
        : '/api/notification-rules';
      
      const res = await fetch(url, {
        method: editingRule ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ruleForm),
      });

      if (res.ok) {
        const { data } = await res.json();
        if (editingRule) {
          setRules(rules.map(r => r.id === editingRule.id ? data : r));
        } else {
          setRules([...rules, data]);
        }
        setShowRuleModal(false);
        showMessage('success', `Rule ${editingRule ? 'updated' : 'created'}`);
      } else {
        const { error } = await res.json();
        showMessage('error', error || 'Failed to save rule');
      }
    } catch {
      showMessage('error', 'Failed to save rule');
    } finally {
      setLoading(false);
    }
  };

  // Send custom notification
  const sendNotification = async () => {
    if (!sendForm.title || !sendForm.message) {
      showMessage('error', 'Please fill in title and message');
      return;
    }

    if (sendForm.channels.length === 0) {
      showMessage('error', 'Please select at least one channel');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/notifications/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sendForm),
      });

      const data = await res.json();

      if (res.ok) {
        showMessage('success', `Notifications sent! App: ${data.results.app.sent}, Push: ${data.results.push.sent}, Email: ${data.results.email.sent}`);
        setSendForm({
          title: '',
          message: '',
          action_url: '',
          channels: ['app'],
          recipients: 'all_drivers',
          specific_ids: [],
        });
      } else {
        showMessage('error', data.error || 'Failed to send notifications');
      }
    } catch {
      showMessage('error', 'Failed to send notifications');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className={styles.manager}>
      {/* Message */}
      {message && (
        <div className={`${styles.message} ${styles[message.type]}`}>
          {message.text}
        </div>
      )}

      {/* Tabs */}
      <div className={styles.tabs}>
        <button 
          className={`${styles.tab} ${activeTab === 'rules' ? styles.active : ''}`}
          onClick={() => setActiveTab('rules')}
        >
          Automated Rules
        </button>
        <button 
          className={`${styles.tab} ${activeTab === 'send' ? styles.active : ''}`}
          onClick={() => setActiveTab('send')}
        >
          Send Notification
        </button>
        <button 
          className={`${styles.tab} ${activeTab === 'history' ? styles.active : ''}`}
          onClick={() => setActiveTab('history')}
        >
          History
        </button>
      </div>

      {/* Automated Rules Tab */}
      {activeTab === 'rules' && (
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <h3>Automated Notification Rules</h3>
            <button className="btn btn-primary" onClick={() => openEditModal()}>
              + Add Rule
            </button>
          </div>

          <div className={styles.rulesList}>
            {rules.map(rule => (
              <div key={rule.id} className={`${styles.ruleCard} ${!rule.is_active ? styles.inactive : ''}`}>
                <div className={styles.ruleHeader}>
                  <div className={styles.ruleInfo}>
                    <h4>{rule.name}</h4>
                    <span className={styles.ruleTrigger}>
                      {TRIGGER_TYPES.find(t => t.value === rule.trigger_type)?.label}
                    </span>
                  </div>
                  <div className={styles.ruleActions}>
                    <label className={styles.toggle}>
                      <input 
                        type="checkbox" 
                        checked={rule.is_active}
                        onChange={() => toggleRuleActive(rule)}
                      />
                      <span className={styles.toggleSlider}></span>
                    </label>
                    <button 
                      className={styles.editBtn}
                      onClick={() => openEditModal(rule)}
                    >
                      Edit
                    </button>
                    <button 
                      className={styles.deleteBtn}
                      onClick={() => deleteRule(rule.id)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
                <div className={styles.ruleDetails}>
                  <span className={styles.ruleChannel}>
                    📢 {CHANNELS.find(c => c.value === rule.channel)?.label}
                  </span>
                  <span className={styles.ruleTarget}>
                    👥 {TARGET_ROLES.find(r => r.value === rule.target_role)?.label}
                  </span>
                  {(rule.trigger_config as Record<string, string>)?.action_url && (
                    <span className={styles.ruleLink}>
                      🔗 {ACTION_PAGES.find(p => p.value === (rule.trigger_config as Record<string, string>).action_url)?.label || (rule.trigger_config as Record<string, string>).action_url}
                    </span>
                  )}
                </div>
                {rule.description && (
                  <p className={styles.ruleDescription}>{rule.description}</p>
                )}
              </div>
            ))}

            {rules.length === 0 && (
              <div className={styles.emptyState}>
                No notification rules configured yet.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Send Notification Tab */}
      {activeTab === 'send' && (
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <h3>Send Custom Notification</h3>
          </div>

          <div className={styles.sendForm}>
            <div className={styles.formGroup}>
              <label>Title *</label>
              <input
                type="text"
                value={sendForm.title}
                onChange={e => setSendForm({ ...sendForm, title: e.target.value })}
                placeholder="Notification title"
              />
            </div>

            <div className={styles.formGroup}>
              <label>Message *</label>
              <textarea
                value={sendForm.message}
                onChange={e => setSendForm({ ...sendForm, message: e.target.value })}
                placeholder="Notification message..."
                rows={4}
              />
            </div>

            <div className={styles.formGroup}>
              <label>Link URL (optional)</label>
              <input
                type="text"
                value={sendForm.action_url}
                onChange={e => setSendForm({ ...sendForm, action_url: e.target.value })}
                placeholder="e.g., /driver/roster or /fleet/vehicles"
              />
              <span className={styles.helpText}>
                When clicked, the notification will navigate to this page
              </span>
            </div>

            <div className={styles.formGroup}>
              <label>Channels *</label>
              <div className={styles.checkboxGroup}>
                {[
                  { value: 'app', label: 'Dashboard Notification' },
                  { value: 'push', label: 'Push Notification' },
                  { value: 'email', label: 'Email' },
                ].map(channel => (
                  <label key={channel.value} className={styles.checkbox}>
                    <input
                      type="checkbox"
                      checked={sendForm.channels.includes(channel.value)}
                      onChange={e => {
                        if (e.target.checked) {
                          setSendForm({ ...sendForm, channels: [...sendForm.channels, channel.value] });
                        } else {
                          setSendForm({ ...sendForm, channels: sendForm.channels.filter(c => c !== channel.value) });
                        }
                      }}
                    />
                    {channel.label}
                  </label>
                ))}
              </div>
            </div>

            <div className={styles.formGroup}>
              <label>Recipients *</label>
              <select
                value={sendForm.recipients}
                onChange={e => setSendForm({ ...sendForm, recipients: e.target.value })}
              >
                <option value="all_drivers">All Active Drivers</option>
                <option value="all_admins">All Admins & Staff</option>
                <option value="all">Everyone</option>
                <option value="specific">Specific Drivers</option>
              </select>
            </div>

            {sendForm.recipients === 'specific' && (
              <div className={styles.formGroup}>
                <label>Select Drivers</label>
                <div className={styles.driverSelect}>
                  {drivers.map(driver => (
                    <label key={driver.id} className={styles.checkbox}>
                      <input
                        type="checkbox"
                        checked={sendForm.specific_ids.includes(driver.id)}
                        onChange={e => {
                          if (e.target.checked) {
                            setSendForm({ ...sendForm, specific_ids: [...sendForm.specific_ids, driver.id] });
                          } else {
                            setSendForm({ ...sendForm, specific_ids: sendForm.specific_ids.filter(id => id !== driver.id) });
                          }
                        }}
                      />
                      {driver.full_name}
                    </label>
                  ))}
                </div>
              </div>
            )}

            <button 
              className="btn btn-primary"
              onClick={sendNotification}
              disabled={loading}
            >
              {loading ? 'Sending...' : 'Send Notification'}
            </button>
          </div>
        </div>
      )}

      {/* History Tab */}
      {activeTab === 'history' && (
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <h3>Notification History</h3>
          </div>

          <div className={styles.historyList}>
            {logs.map(log => (
              <div key={log.id} className={styles.historyItem}>
                <div className={styles.historyHeader}>
                  <span className={styles.historyTitle}>{log.title}</span>
                  <span className={styles.historyDate}>{formatDate(log.created_at)}</span>
                </div>
                <p className={styles.historyBody}>{log.body}</p>
                <div className={styles.historyMeta}>
                  <span className={`${styles.historyChannel} ${styles[log.channel]}`}>
                    {log.channel}
                  </span>
                  <span className={`${styles.historyStatus} ${styles[log.status]}`}>
                    {log.status}
                  </span>
                </div>
              </div>
            ))}

            {logs.length === 0 && (
              <div className={styles.emptyState}>
                No notifications sent yet.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Rule Edit Modal */}
      {showRuleModal && (
        <div className={styles.modalOverlay} onClick={() => setShowRuleModal(false)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3>{editingRule ? 'Edit Rule' : 'Add Rule'}</h3>
              <button className={styles.closeBtn} onClick={() => setShowRuleModal(false)}>×</button>
            </div>
            <div className={styles.modalBody}>
              <div className={styles.formGroup}>
                <label>Name *</label>
                <input
                  type="text"
                  value={ruleForm.name}
                  onChange={e => setRuleForm({ ...ruleForm, name: e.target.value })}
                  placeholder="Rule name"
                />
              </div>

              <div className={styles.formGroup}>
                <label>Description</label>
                <input
                  type="text"
                  value={ruleForm.description}
                  onChange={e => setRuleForm({ ...ruleForm, description: e.target.value })}
                  placeholder="Optional description"
                />
              </div>

              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label>Trigger</label>
                  <select
                    value={ruleForm.trigger_type}
                    onChange={e => setRuleForm({ ...ruleForm, trigger_type: e.target.value })}
                  >
                    {TRIGGER_TYPES.map(t => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>

                <div className={styles.formGroup}>
                  <label>Channel</label>
                  <select
                    value={ruleForm.channel}
                    onChange={e => setRuleForm({ ...ruleForm, channel: e.target.value })}
                  >
                    {CHANNELS.map(c => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className={styles.formGroup}>
                <label>Target Audience</label>
                <select
                  value={ruleForm.target_role}
                  onChange={e => setRuleForm({ ...ruleForm, target_role: e.target.value })}
                >
                  {TARGET_ROLES.map(r => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
              </div>

              {/* Trigger-specific config */}
              {ruleForm.trigger_type === 'shift_reminder' && (
                <div className={styles.formGroup}>
                  <label>Hours Before Shift</label>
                  <input
                    type="number"
                    value={(ruleForm.trigger_config.hours_before as number) || 24}
                    onChange={e => setRuleForm({ 
                      ...ruleForm, 
                      trigger_config: { ...ruleForm.trigger_config, hours_before: parseInt(e.target.value) }
                    })}
                    min="1"
                  />
                </div>
              )}

              {ruleForm.trigger_type === 'document_expiry' && (
                <div className={styles.formGroup}>
                  <label>Days Before Expiry</label>
                  <input
                    type="number"
                    value={(ruleForm.trigger_config.days_before as number) || 30}
                    onChange={e => setRuleForm({ 
                      ...ruleForm, 
                      trigger_config: { ...ruleForm.trigger_config, days_before: parseInt(e.target.value) }
                    })}
                    min="1"
                  />
                </div>
              )}

              {ruleForm.trigger_type === 'service_due' && (
                <>
                  <div className={styles.formGroup}>
                    <label>KM Threshold</label>
                    <input
                      type="number"
                      value={(ruleForm.trigger_config.km_threshold as number) || 2000}
                      onChange={e => setRuleForm({
                        ...ruleForm,
                        trigger_config: { ...ruleForm.trigger_config, km_threshold: parseInt(e.target.value) }
                      })}
                      min="100"
                      step="100"
                    />
                  </div>
                  <div className={styles.formGroup}>
                    <label>Days Before Due Date</label>
                    <input
                      type="number"
                      value={(ruleForm.trigger_config.days_before as number) || 14}
                      onChange={e => setRuleForm({
                        ...ruleForm,
                        trigger_config: { ...ruleForm.trigger_config, days_before: parseInt(e.target.value) }
                      })}
                      min="1"
                    />
                  </div>
                </>
              )}

              <div className={styles.formGroup}>
                <label>Title Template *</label>
                <input
                  type="text"
                  value={ruleForm.title_template}
                  onChange={e => setRuleForm({ ...ruleForm, title_template: e.target.value })}
                  placeholder="e.g., New Roster Published"
                />
                <span className={styles.helpText}>
                  Available: {'{{driver_name}}, {{vehicle_reg}}, {{roster_title}}, {{expiry_date}}'}
                </span>
              </div>

              <div className={styles.formGroup}>
                <label>Body Template *</label>
                <textarea
                  value={ruleForm.body_template}
                  onChange={e => setRuleForm({ ...ruleForm, body_template: e.target.value })}
                  placeholder="Notification message..."
                  rows={3}
                />
              </div>

              <div className={styles.formGroup}>
                <label>Link to Page</label>
                <select
                  value={(ruleForm.trigger_config.action_url as string) || ''}
                  onChange={e => setRuleForm({ 
                    ...ruleForm, 
                    trigger_config: { ...ruleForm.trigger_config, action_url: e.target.value || undefined }
                  })}
                >
                  {ACTION_PAGES.map(p => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </select>
                <span className={styles.helpText}>
                  When the user clicks this notification, they will be taken to this page
                </span>
              </div>

              <label className={styles.checkbox}>
                <input
                  type="checkbox"
                  checked={ruleForm.is_active}
                  onChange={e => setRuleForm({ ...ruleForm, is_active: e.target.checked })}
                />
                Rule is active
              </label>
            </div>
            <div className={styles.modalFooter}>
              <button className="btn btn-secondary" onClick={() => setShowRuleModal(false)}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={saveRule} disabled={loading}>
                {loading ? 'Saving...' : 'Save Rule'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
