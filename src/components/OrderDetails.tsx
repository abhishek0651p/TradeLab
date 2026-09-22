import React from 'react';
import {
  Clock,
  ArrowUpRight,
  ArrowDownRight,
  Tag,
  Package,
  XCircle,
  CheckCircle,
  AlertTriangle,
  Zap,
  ChevronDown,
  ChevronRight,
  FileText,
  Ban,
  RefreshCw,
} from 'lucide-react';
import type { Order } from '../types';

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(value);

const formatDateTime = (iso: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true,
  });
};

const formatDate = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

interface OrderDetailsProps {
  order: Order;
  currentPrice: number;
  onCancel?: (orderId: string) => void;
}

const OrderDetails: React.FC<OrderDetailsProps> = ({ order, currentPrice, onCancel }) => {
  const isTerminal = ['EXECUTED', 'CANCELLED', 'REJECTED'].includes(order.status);
  const isPending = order.status === 'PENDING';

  return (
    <div className="d17-order-details">
      {/* ── Detail Grid ── */}
      <div className="d17-detail-grid">
        <div className="d17-detail-item">
          <span className="d17-detail-label">Order ID</span>
          <span className="d17-detail-value d17-mono">{order.id}</span>
        </div>
        <div className="d17-detail-item">
          <span className="d17-detail-label">Symbol</span>
          <span className="d17-detail-value">{order.symbol}</span>
        </div>
        <div className="d17-detail-item">
          <span className="d17-detail-label">Company</span>
          <span className="d17-detail-value">{order.companyName}</span>
        </div>
        <div className="d17-detail-item">
          <span className="d17-detail-label">Side</span>
          <span className={`d17-detail-value d17-side-badge ${order.side === 'BUY' ? 'd17-side-buy' : 'd17-side-sell'}`}>
            {order.side === 'BUY' ? <ArrowDownRight size={14} /> : <ArrowUpRight size={14} />}
            {order.side}
          </span>
        </div>
        <div className="d17-detail-item">
          <span className="d17-detail-label">Order Type</span>
          <span className="d17-detail-value"><Tag size={14} /> {order.type.replace('_', ' ')}</span>
        </div>
        <div className="d17-detail-item">
          <span className="d17-detail-label">Quantity</span>
          <span className="d17-detail-value"><Package size={14} /> {order.quantity}</span>
        </div>
        <div className="d17-detail-item">
          <span className="d17-detail-label">Requested Price</span>
          <span className="d17-detail-value">
            {order.type === 'MARKET' ? 'Market' : formatCurrency(order.requestedPrice)}
          </span>
        </div>
        {order.triggerPrice && (
          <div className="d17-detail-item">
            <span className="d17-detail-label">Trigger Price</span>
            <span className="d17-detail-value">{formatCurrency(order.triggerPrice)}</span>
          </div>
        )}
        <div className="d17-detail-item">
          <span className="d17-detail-label">Current Price</span>
          <span className="d17-detail-value">
            {currentPrice > 0 ? formatCurrency(currentPrice) : '—'}
          </span>
        </div>
        <div className="d17-detail-item">
          <span className="d17-detail-label">Status</span>
          <span className={`d17-status-badge d17-status-${order.status.toLowerCase()}`}>
            {order.status === 'PENDING' && <Clock size={14} />}
            {order.status === 'TRIGGERED' && <Zap size={14} />}
            {order.status === 'EXECUTED' && <CheckCircle size={14} />}
            {order.status === 'CANCELLED' && <Ban size={14} />}
            {order.status === 'REJECTED' && <XCircle size={14} />}
            {order.status}
          </span>
        </div>
        <div className="d17-detail-item">
          <span className="d17-detail-label">Created</span>
          <span className="d17-detail-value"><Clock size={14} /> {formatDate(order.createdAt)}</span>
        </div>
        {order.executedAt && (
          <div className="d17-detail-item">
            <span className="d17-detail-label">Executed At</span>
            <span className="d17-detail-value"><CheckCircle size={14} /> {formatDateTime(order.executedAt)}</span>
          </div>
        )}
        {order.cancelledAt && (
          <div className="d17-detail-item">
            <span className="d17-detail-label">Cancelled At</span>
            <span className="d17-detail-value"><Ban size={14} /> {formatDateTime(order.cancelledAt)}</span>
          </div>
        )}
        {order.executionPrice !== null && order.executionPrice !== undefined && (
          <div className="d17-detail-item">
            <span className="d17-detail-label">Execution Price</span>
            <span className="d17-detail-value text-success">{formatCurrency(order.executionPrice)}</span>
          </div>
        )}
        {order.totalValue !== null && order.totalValue !== undefined && (
          <div className="d17-detail-item">
            <span className="d17-detail-label">Total Value</span>
            <span className="d17-detail-value">{formatCurrency(order.totalValue)}</span>
          </div>
        )}
        {order.rejectionReason && (
          <div className="d17-detail-item d17-reason-item">
            <span className="d17-detail-label">Rejection Reason</span>
            <span className="d17-detail-value text-danger">{order.rejectionReason}</span>
          </div>
        )}
      </div>

      {/* ── Lifecycle Timeline ── */}
      <div className="d17-lifecycle">
        <div className="d17-lifecycle-title">
          <RefreshCw size={14} />
          <span>Order Lifecycle</span>
        </div>
        <div className="d17-lifecycle-timeline">
          {/* Created */}
          <div className="d17-lifecycle-node">
            <div className="d17-lifecycle-dot d17-lifecycle-created" />
            <div className="d17-lifecycle-content">
              <div className="d17-lifecycle-event">Order Created</div>
              <div className="d17-lifecycle-time">{formatDateTime(order.createdAt)}</div>
            </div>
          </div>

          {/* Triggered */}
          {order.status === 'TRIGGERED' && (
            <div className="d17-lifecycle-node">
              <div className="d17-lifecycle-dot d17-lifecycle-triggered" />
              <div className="d17-lifecycle-content">
                <div className="d17-lifecycle-event">Order Triggered</div>
                <div className="d17-lifecycle-time">{formatDateTime(order.createdAt)}</div>
              </div>
            </div>
          )}

          {/* Executed */}
          {order.status === 'EXECUTED' && order.executedAt && (
            <div className="d17-lifecycle-node">
              <div className="d17-lifecycle-dot d17-lifecycle-executed" />
              <div className="d17-lifecycle-content">
                <div className="d17-lifecycle-event">Order Executed</div>
                <div className="d17-lifecycle-time">{formatDateTime(order.executedAt)}</div>
              </div>
            </div>
          )}

          {/* Cancelled */}
          {order.status === 'CANCELLED' && order.cancelledAt && (
            <div className="d17-lifecycle-node">
              <div className="d17-lifecycle-dot d17-lifecycle-cancelled" />
              <div className="d17-lifecycle-content">
                <div className="d17-lifecycle-event">Order Cancelled</div>
                <div className="d17-lifecycle-time">{formatDateTime(order.cancelledAt)}</div>
              </div>
            </div>
          )}

          {/* Rejected */}
          {order.status === 'REJECTED' && (
            <div className="d17-lifecycle-node">
              <div className="d17-lifecycle-dot d17-lifecycle-rejected" />
              <div className="d17-lifecycle-content">
                <div className="d17-lifecycle-event">Order Rejected</div>
                <div className="d17-lifecycle-time">
                  {order.rejectionReason ? 'Validation failed' : '—'}
                </div>
              </div>
            </div>
          )}

          {/* Terminal state reached at same time as created if no transition */}
          {isTerminal && !order.executedAt && !order.cancelledAt && order.status === 'REJECTED' && (
            <div className="d17-lifecycle-node">
              <div className="d17-lifecycle-dot d17-lifecycle-rejected" />
              <div className="d17-lifecycle-content">
                <div className="d17-lifecycle-event">Rejected at creation</div>
                <div className="d17-lifecycle-time">{formatDateTime(order.createdAt)}</div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Contextual Actions ── */}
      {isPending && onCancel && (
        <div className="d17-actions">
          <button className="d17-action-btn d17-action-cancel" onClick={() => onCancel(order.id)}>
            <XCircle size={16} />
            Cancel Order
          </button>
        </div>
      )}
    </div>
  );
};

export default OrderDetails;
