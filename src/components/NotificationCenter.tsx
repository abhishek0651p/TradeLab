import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTrading } from '../context/TradingContext';
import {
  X,
  CheckCheck,
  Trash2,
  Bell,
  BellOff,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Zap,
  TrendingUp,
  RotateCcw,
  Info,
  ChevronRight
} from 'lucide-react';
import type { Notification, NotificationType } from '../types';

/* ── Filter types ── */

type FilterTab = 'all' | 'unread' | 'orders' | 'system';

const ORDER_TYPES: NotificationType[] = [
  'ORDER_EXECUTED',
  'ORDER_REJECTED',
  'ORDER_CANCELLED',
  'ORDER_TRIGGERED'
];

const SYSTEM_TYPES: NotificationType[] = [
  'MARKET_EVENT',
  'ACCOUNT_EVENT',
  'SYSTEM'
];

/* ── Relative time helper ── */

const formatRelativeTime = (timestamp: number): string => {
  const now = Date.now();
  const diffMs = now - timestamp;
  const diffSec = Math.floor(diffMs / 1000);

  if (diffSec < 10) return 'Just now';
  if (diffSec < 60) return `${diffSec}s ago`;

  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;

  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;

  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
};

/* ── Priority icon ── */

const getPriorityIcon = (n: Notification) => {
  switch (n.type) {
    case 'ORDER_EXECUTED':
      return <CheckCircle size={16} className="d16-icon d16-icon-success" />;
    case 'ORDER_REJECTED':
      return <XCircle size={16} className="d16-icon d16-icon-error" />;
    case 'ORDER_CANCELLED':
      return <X size={16} className="d16-icon d16-icon-muted" />;
    case 'ORDER_TRIGGERED':
      return <Zap size={16} className="d16-icon d16-icon-warning" />;
    case 'MARKET_EVENT':
      return <TrendingUp size={16} className="d16-icon d16-icon-warning" />;
    case 'ACCOUNT_EVENT':
      return <RotateCcw size={16} className="d16-icon d16-icon-info" />;
    case 'SYSTEM':
      return <Info size={16} className="d16-icon d16-icon-info" />;
    default:
      return <Bell size={16} className="d16-icon" />;
  }
};

/* ── Component Props ── */

interface NotificationCenterProps {
  isOpen: boolean;
  onClose: () => void;
}

/* ── NotificationCenter ── */

const NotificationCenter: React.FC<NotificationCenterProps> = ({ isOpen, onClose }) => {
  const navigate = useNavigate();
  const {
    notifications,
    markNotificationRead,
    markAllNotificationsRead,
    clearNotifications
  } = useTrading();

  const [activeFilter, setActiveFilter] = useState<FilterTab>('all');
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        // Check if click was on the bell button (parent controls that)
        const target = e.target as HTMLElement;
        if (target.closest('.d16-bell-btn')) return;
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, onClose]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  /* ── Filtered notifications ── */

  const filteredNotifications = useMemo(() => {
    switch (activeFilter) {
      case 'unread':
        return notifications.filter(n => !n.read);
      case 'orders':
        return notifications.filter(n => ORDER_TYPES.includes(n.type));
      case 'system':
        return notifications.filter(n => SYSTEM_TYPES.includes(n.type));
      default:
        return notifications;
    }
  }, [notifications, activeFilter]);

  const unreadInFilter = filteredNotifications.filter(n => !n.read).length;

  /* ── Handlers ── */

  const handleNotificationClick = (n: Notification) => {
    markNotificationRead(n.id);
    if (n.route) {
      navigate(n.route);
      onClose();
    }
  };

  const handleMarkAllRead = () => {
    markAllNotificationsRead();
  };

  const handleClearAll = () => {
    clearNotifications();
  };

  if (!isOpen) return null;

  /* ── Filter tabs ── */
  const filters: { id: FilterTab; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'unread', label: 'Unread' },
    { id: 'orders', label: 'Orders' },
    { id: 'system', label: 'System' }
  ];

  return (
    <div className="d16-center" ref={panelRef} role="dialog" aria-label="Activity Center">
      {/* Header */}
      <div className="d16-center-header">
        <h3 className="d16-center-title">Activity Center</h3>
        <div className="d16-center-actions">
          <button
            className="d16-action-btn"
            onClick={handleMarkAllRead}
            aria-label="Mark all as read"
            title="Mark all as read"
            disabled={unreadInFilter === 0 && notifications.filter(n => !n.read).length === 0}
          >
            <CheckCheck size={15} />
          </button>
          <button
            className="d16-action-btn"
            onClick={handleClearAll}
            aria-label="Clear all notifications"
            title="Clear all"
            disabled={notifications.length === 0}
          >
            <Trash2 size={15} />
          </button>
          <button
            className="d16-action-btn d16-close-btn"
            onClick={onClose}
            aria-label="Close activity center"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="d16-center-filters">
        {filters.map(f => (
          <button
            key={f.id}
            className={`d16-filter-tab ${activeFilter === f.id ? 'd16-filter-active' : ''}`}
            onClick={() => setActiveFilter(f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Notification list */}
      <div className="d16-center-list">
        {filteredNotifications.length === 0 ? (
          <div className="d16-empty-state">
            <BellOff size={36} strokeWidth={1.5} />
            <p className="d16-empty-title">You're all caught up</p>
            <p className="d16-empty-desc">
              Order executions, alerts, and important activity will appear here.
            </p>
          </div>
        ) : (
          filteredNotifications.map(n => (
            <button
              key={n.id}
              className={`d16-notif-row ${!n.read ? 'd16-notif-unread' : ''} ${n.route ? 'd16-notif-clickable' : ''}`}
              onClick={() => handleNotificationClick(n)}
              aria-label={`${n.read ? '' : 'Unread: '}${n.title} — ${n.message}`}
            >
              <div className="d16-notif-icon">
                {getPriorityIcon(n)}
              </div>
              <div className="d16-notif-content">
                <div className="d16-notif-title">{n.title}</div>
                <div className="d16-notif-message">{n.message}</div>
                <div className="d16-notif-time">{formatRelativeTime(n.timestamp)}</div>
              </div>
              <div className="d16-notif-meta">
                {!n.read && <span className="d16-unread-dot" />}
                {n.route && <ChevronRight size={14} className="d16-notif-chevron" />}
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
};

export default NotificationCenter;
export { formatRelativeTime, getPriorityIcon };
