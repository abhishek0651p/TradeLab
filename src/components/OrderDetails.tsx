import React, { useState } from 'react';
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
  Edit3,
  History,
  Save,
  X
} from 'lucide-react';
import type { Order } from '../types';
import { useTrading } from '../context/TradingContext';

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
  const { modifyOrder, bracketGroups } = useTrading();
  const isTerminal = ['EXECUTED', 'CANCELLED', 'REJECTED'].includes(order.status);
  const isPending = order.status === 'PENDING';
  const filledQty = order.filledQuantity ?? 0;
  const remainingQty = order.remainingQuantity ?? (order.quantity - filledQty);

  // Check if order belongs to an active bracket group
  const isBracketChildOrParent = bracketGroups.some(
    bg =>
      bg.status === 'ACTIVE' &&
      (bg.parentOrderId === order.id || bg.stopLossOrderId === order.id || bg.targetOrderId === order.id)
  );
  const isModifiable = (order.status === 'PENDING' || order.status === 'PARTIALLY_FILLED') && !isBracketChildOrParent;

  const [isModifying, setIsModifying] = useState(false);
  const [modQty, setModQty] = useState(String(order.quantity));
  const [modPrice, setModPrice] = useState(String(order.requestedPrice));
  const [modTriggerPrice, setModTriggerPrice] = useState(String(order.triggerPrice ?? ''));
  const [modReason, setModReason] = useState('');
  const [modError, setModError] = useState<string | null>(null);

  const handleStartModify = () => {
    setModQty(String(order.quantity));
    setModPrice(String(order.requestedPrice));
    setModTriggerPrice(String(order.triggerPrice ?? ''));
    setModReason('');
    setModError(null);
    setIsModifying(true);
  };

  const handleCancelModify = () => {
    setIsModifying(false);
    setModError(null);
  };

  const handleSubmitModify = (e: React.FormEvent) => {
    e.preventDefault();
    setModError(null);
    const parsedQty = Number(modQty);
    const parsedPrice = Number(modPrice);
    const parsedTrigger = modTriggerPrice.trim() ? Number(modTriggerPrice) : undefined;

    const res = modifyOrder({
      orderId: order.id,
      quantity: !isNaN(parsedQty) && parsedQty !== order.quantity ? parsedQty : undefined,
      price: !isNaN(parsedPrice) && parsedPrice !== order.requestedPrice ? parsedPrice : undefined,
      triggerPrice: parsedTrigger !== undefined && parsedTrigger !== order.triggerPrice ? parsedTrigger : undefined,
      reason: modReason.trim() ? modReason.trim() : undefined,
      expectedVersion: order.orderVersion ?? 1,
    });

    if (res.success) {
      setIsModifying(false);
    } else {
      setModError(res.error ?? 'Failed to modify order.');
    }
  };

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
          <span className="d17-detail-label">Total Quantity</span>
          <span className="d17-detail-value"><Package size={14} /> {order.quantity}</span>
        </div>
        {filledQty > 0 && (
          <div className="d17-detail-item">
            <span className="d17-detail-label">Filled Quantity</span>
            <span className="d17-detail-value text-success">{filledQty}</span>
          </div>
        )}
        <div className="d17-detail-item">
          <span className="d17-detail-label">Remaining Quantity</span>
          <span className="d17-detail-value font-semibold">{remainingQty}</span>
        </div>
        {(order.orderVersion ?? 1) > 1 && (
          <div className="d17-detail-item">
            <span className="d17-detail-label">Revision</span>
            <span className="d17-detail-value text-primary">Rev #{order.orderVersion} ({order.modificationCount} mod{(order.modificationCount ?? 0) > 1 ? 's' : ''})</span>
          </div>
        )}
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
        {order.netValue !== null && order.netValue !== undefined && (
          <div className="d17-detail-item">
            <span className="d17-detail-label">Net Value ({order.side === 'BUY' ? 'Total Cost' : 'Net Proceeds'})</span>
            <span className="d17-detail-value font-semibold text-primary">{formatCurrency(order.netValue)}</span>
          </div>
        )}
        {order.charges && (order.charges.totalCharges ?? 0) > 0 && (
          <div className="d17-detail-item">
            <span className="d17-detail-label">Total Charges</span>
            <span className="d17-detail-value" style={{ color: '#f59e0b' }}>{formatCurrency(order.charges.totalCharges ?? 0)}</span>
          </div>
        )}
        {order.isGTT && (
          <div className="d17-detail-item">
            <span className="d17-detail-label">Mechanism</span>
            <span className="d17-detail-value d20-gtt-badge-text">
              Good-Till-Triggered (GTT)
            </span>
          </div>
        )}
        {order.isGTT && (
          <div className="d17-detail-item">
            <span className="d17-detail-label">Validity</span>
            <span className="d17-detail-value">
              {order.expiry ? `GTD: ${formatDateTime(order.expiry)}` : 'GTC (Good-Till-Cancelled)'}
            </span>
          </div>
        )}
        {order.trailingConfig && (
          <div className="d17-detail-item">
            <span className="d17-detail-label">Trailing Distance</span>
            <span className="d17-detail-value text-primary">
              {order.trailingConfig.distance}{order.trailingConfig.distanceType === 'percent' ? '%' : ' ₹'} (Trailing Stop)
            </span>
          </div>
        )}
        {order.highestPriceSinceCreation !== undefined && (
          <div className="d17-detail-item">
            <span className="d17-detail-label">Reference Peak</span>
            <span className="d17-detail-value">{formatCurrency(order.highestPriceSinceCreation)}</span>
          </div>
        )}
        {order.lowestPriceSinceCreation !== undefined && (
          <div className="d17-detail-item">
            <span className="d17-detail-label">Reference Trough</span>
            <span className="d17-detail-value">{formatCurrency(order.lowestPriceSinceCreation)}</span>
          </div>
        )}
        {order.rejectionReason && (
          <div className="d17-detail-item d17-reason-item">
            <span className="d17-detail-label">{order.rejectionReason.toLowerCase().includes('expired') ? 'Expiry Reason' : 'Rejection Reason'}</span>
            <span className="d17-detail-value text-danger">{order.rejectionReason}</span>
          </div>
        )}
      </div>

      {/* ── Transaction Costs Breakdown (Day 32 Phase D) ── */}
      {order.charges && (order.charges.totalCharges ?? 0) > 0 && (
        <div className="d17-charges-card" style={{
          margin: '12px 0 16px 0',
          padding: '14px',
          borderRadius: '8px',
          background: 'rgba(255, 255, 255, 0.03)',
          border: '1px solid rgba(255, 255, 255, 0.08)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <span style={{ fontSize: '13px', fontWeight: 600 }}>
              Transaction Charges Breakdown
            </span>
            <span style={{ fontSize: '13px', fontWeight: 700, color: '#f59e0b' }}>
              {formatCurrency(order.charges.totalCharges ?? 0)}
            </span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '8px', fontSize: '12px' }}>
            <div><span style={{ color: '#94a3b8' }}>Brokerage:</span> <strong>{formatCurrency(order.charges.brokerage ?? 0)}</strong></div>
            <div><span style={{ color: '#94a3b8' }}>STT:</span> <strong>{formatCurrency(order.charges.stt ?? 0)}</strong></div>
            <div><span style={{ color: '#94a3b8' }}>Exchange:</span> <strong>{formatCurrency(order.charges.exchangeTransactionCharges ?? 0)}</strong></div>
            <div><span style={{ color: '#94a3b8' }}>GST (18%):</span> <strong>{formatCurrency(order.charges.gst ?? 0)}</strong></div>
            <div><span style={{ color: '#94a3b8' }}>SEBI:</span> <strong>{formatCurrency(order.charges.sebiCharges ?? 0)}</strong></div>
            <div><span style={{ color: '#94a3b8' }}>Stamp Duty:</span> <strong>{formatCurrency(order.charges.stampDuty ?? 0)}</strong></div>
          </div>
        </div>
      )}

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

          {/* Rejected or Expired */}
          {order.status === 'REJECTED' && (
            <div className="d17-lifecycle-node">
              <div className="d17-lifecycle-dot d17-lifecycle-rejected" />
              <div className="d17-lifecycle-content">
                <div className="d17-lifecycle-event">
                  {order.rejectionReason?.toLowerCase().includes('expired') ? 'Order Expired' : 'Order Rejected'}
                </div>
                <div className="d17-lifecycle-time">
                  {order.rejectionReason ?? 'Validation failed'}
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
      <div className="d17-actions" style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
        {isModifiable && !isModifying && (
          <button
            className="d17-action-btn"
            style={{
              background: 'rgba(59, 130, 246, 0.15)',
              color: '#60a5fa',
              border: '1px solid rgba(59, 130, 246, 0.3)',
              padding: '6px 14px',
              borderRadius: '6px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '13px',
              fontWeight: 500
            }}
            onClick={handleStartModify}
          >
            <Edit3 size={15} />
            Modify Order
          </button>
        )}
        {(isPending || order.status === 'PARTIALLY_FILLED') && onCancel && (
          <button className="d17-action-btn d17-action-cancel" onClick={() => onCancel(order.id)}>
            <XCircle size={16} />
            Cancel Order
          </button>
        )}
      </div>

      {/* ── Order Modification Form (Day 32 Phase E) ── */}
      {isModifying && (
        <form onSubmit={handleSubmitModify} className="d17-modify-card" style={{
          marginTop: '16px',
          padding: '16px',
          borderRadius: '8px',
          background: 'rgba(255, 255, 255, 0.04)',
          border: '1px solid rgba(59, 130, 246, 0.4)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <span style={{ fontSize: '14px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Edit3 size={16} className="text-primary" /> Modify Order Parameters
            </span>
            <span style={{ fontSize: '11px', color: '#94a3b8' }}>
              Current Rev #{order.orderVersion ?? 1}
            </span>
          </div>

          {modError && (
            <div style={{ padding: '8px 12px', marginBottom: '12px', borderRadius: '4px', background: 'rgba(239, 68, 68, 0.15)', border: '1px solid #ef4444', color: '#fca5a5', fontSize: '12px' }}>
              {modError}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px', marginBottom: '12px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '11px', color: '#94a3b8', marginBottom: '4px' }}>
                Total Quantity {filledQty > 0 ? `(Filled: ${filledQty}, Min: ${filledQty})` : ''}
              </label>
              <input
                type="number"
                min={filledQty > 0 ? filledQty : 1}
                value={modQty}
                onChange={e => setModQty(e.target.value)}
                style={{ width: '100%', padding: '6px 10px', borderRadius: '4px', border: '1px solid #334155', background: '#0f172a', color: '#f8fafc', fontSize: '13px' }}
                required
              />
            </div>

            {order.type !== 'MARKET' && (
              <div>
                <label style={{ display: 'block', fontSize: '11px', color: '#94a3b8', marginBottom: '4px' }}>
                  Limit Price (₹)
                </label>
                <input
                  type="number"
                  step="0.05"
                  min="0.05"
                  value={modPrice}
                  onChange={e => setModPrice(e.target.value)}
                  style={{ width: '100%', padding: '6px 10px', borderRadius: '4px', border: '1px solid #334155', background: '#0f172a', color: '#f8fafc', fontSize: '13px' }}
                  required
                />
              </div>
            )}

            {(order.type === 'STOP_LIMIT' || order.type === 'STOP_MARKET' || order.isGTT) && (
              <div>
                <label style={{ display: 'block', fontSize: '11px', color: '#94a3b8', marginBottom: '4px' }}>
                  Trigger Price (₹)
                </label>
                <input
                  type="number"
                  step="0.05"
                  min="0.05"
                  value={modTriggerPrice}
                  onChange={e => setModTriggerPrice(e.target.value)}
                  style={{ width: '100%', padding: '6px 10px', borderRadius: '4px', border: '1px solid #334155', background: '#0f172a', color: '#f8fafc', fontSize: '13px' }}
                />
              </div>
            )}

            <div>
              <label style={{ display: 'block', fontSize: '11px', color: '#94a3b8', marginBottom: '4px' }}>
                Reason (Optional)
              </label>
              <input
                type="text"
                placeholder="e.g. Adjusted target"
                value={modReason}
                onChange={e => setModReason(e.target.value)}
                style={{ width: '100%', padding: '6px 10px', borderRadius: '4px', border: '1px solid #334155', background: '#0f172a', color: '#f8fafc', fontSize: '13px' }}
              />
            </div>
          </div>

          {/* Live Preview */}
          <div style={{ padding: '8px 12px', borderRadius: '6px', background: 'rgba(0, 0, 0, 0.25)', fontSize: '11px', color: '#cbd5e1', marginBottom: '12px' }}>
            <span>New Remaining Qty: <strong>{Math.max(0, Number(modQty) - filledQty)}</strong></span>
            <span style={{ margin: '0 8px' }}>•</span>
            <span>New Remaining Value: <strong>{formatCurrency(Math.max(0, Number(modQty) - filledQty) * Number(modPrice || order.requestedPrice))}</strong></span>
          </div>

          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={handleCancelModify}
              className="d17-action-btn"
              style={{ background: '#334155', color: '#f8fafc', border: 'none', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px' }}
            >
              <X size={14} /> Cancel
            </button>
            <button
              type="submit"
              className="d17-action-btn"
              style={{ background: '#2563eb', color: '#fff', border: 'none', padding: '6px 14px', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', fontWeight: 600 }}
            >
              <Save size={14} /> Save Modification
            </button>
          </div>
        </form>
      )}

      {/* ── Order Modification Audit History (Day 32 Phase E) ── */}
      {order.modificationHistory && order.modificationHistory.length > 0 && (
        <div className="d17-mod-history" style={{ marginTop: '16px', padding: '14px', borderRadius: '8px', background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 600, marginBottom: '8px' }}>
            <History size={14} className="text-primary" /> Modification Audit History ({order.modificationHistory.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '11px' }}>
            {order.modificationHistory.map((rec, idx) => (
              <div key={idx} style={{ padding: '6px 10px', borderRadius: '4px', background: 'rgba(0, 0, 0, 0.2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <span style={{ fontWeight: 600, color: '#38bdf8' }}>Rev #{rec.orderVersion}: </span>
                  <span>Qty {rec.previousQuantity} → {rec.newQuantity}</span>
                  {rec.previousRequestedPrice !== rec.newRequestedPrice && (
                    <span>, Price {formatCurrency(rec.previousRequestedPrice)} → {formatCurrency(rec.newRequestedPrice)}</span>
                  )}
                  {rec.previousTriggerPrice !== rec.newTriggerPrice && rec.newTriggerPrice && (
                    <span>, Trigger {formatCurrency(rec.previousTriggerPrice ?? 0)} → {formatCurrency(rec.newTriggerPrice)}</span>
                  )}
                  {rec.reason && <span style={{ color: '#94a3b8' }}> ({rec.reason})</span>}
                </div>
                <div style={{ color: '#64748b' }}>
                  {formatDateTime(rec.timestamp)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default OrderDetails;
