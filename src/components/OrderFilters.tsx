import React from 'react';
import { Search, X } from 'lucide-react';
import type { OrderStatus, OrderSide, OrderType } from '../types';

interface OrderFiltersProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  statusFilter: OrderStatus | 'ALL';
  onStatusFilterChange: (s: OrderStatus | 'ALL') => void;
  sideFilter: OrderSide | 'ALL';
  onSideFilterChange: (s: OrderSide | 'ALL') => void;
  typeFilter: OrderType | 'ALL';
  onTypeFilterChange: (t: OrderType | 'ALL') => void;
  resultCount: number;
  totalCount: number;
  activeFilterCount: number;
  onClearFilters: () => void;
}

const OrderFilters: React.FC<OrderFiltersProps> = ({
  searchQuery,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  sideFilter,
  onSideFilterChange,
  typeFilter,
  onTypeFilterChange,
  resultCount,
  totalCount,
  activeFilterCount,
  onClearFilters,
}) => {
  const statusOptions: (OrderStatus | 'ALL')[] = ['ALL', 'PENDING', 'TRIGGERED', 'EXECUTED', 'CANCELLED', 'REJECTED'];
  const sideOptions: (OrderSide | 'ALL')[] = ['ALL', 'BUY', 'SELL'];
  const typeOptions: (OrderType | 'ALL')[] = ['ALL', 'MARKET', 'LIMIT', 'STOP_MARKET', 'STOP_LIMIT', 'TARGET'];

  const formatLabel = (val: string) => {
    if (val === 'ALL') return 'All';
    if (val === 'STOP_MARKET') return 'Stop M';
    if (val === 'STOP_LIMIT') return 'Stop L';
    if (val === 'TARGET') return 'Target';
    return val.charAt(0) + val.slice(1).toLowerCase();
  };

  return (
    <div className="d17-filter-toolbar">
      {/* Search Row */}
      <div className="d17-filter-row-top">
        <div className="d17-search-wrap">
          <Search size={16} className="d17-search-icon" />
          <input
            type="text"
            className="d17-search-input"
            placeholder="Search symbol or order ID..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
          />
          {searchQuery && (
            <button className="d17-search-clear" onClick={() => onSearchChange('')} aria-label="Clear search">
              <X size={14} />
            </button>
          )}
        </div>
        <span className="d17-result-count">{resultCount} of {totalCount} orders</span>
        {activeFilterCount > 0 && (
          <button className="d17-clear-btn" onClick={onClearFilters}>
            <X size={12} />
            Clear
            {activeFilterCount > 0 && <span className="d17-filter-badge">{activeFilterCount}</span>}
          </button>
        )}
      </div>

      {/* Filter Pill Groups */}
      <div className="d17-filter-pill-groups">
        <div className="d17-pill-group">
          <span className="d17-pill-label">Status</span>
          {statusOptions.map(opt => (
            <button
              key={opt}
              className={`d17-pill ${statusFilter === opt ? 'd17-pill-active' : ''}`}
              onClick={() => onStatusFilterChange(opt)}
            >
              {formatLabel(opt)}
            </button>
          ))}
        </div>
        <div className="d17-pill-group">
          <span className="d17-pill-label">Side</span>
          {sideOptions.map(opt => (
            <button
              key={opt}
              className={`d17-pill ${sideFilter === opt ? 'd17-pill-active' : ''}`}
              onClick={() => onSideFilterChange(opt)}
            >
              {formatLabel(opt)}
            </button>
          ))}
        </div>
        <div className="d17-pill-group">
          <span className="d17-pill-label">Type</span>
          {typeOptions.map(opt => (
            <button
              key={opt}
              className={`d17-pill ${typeFilter === opt ? 'd17-pill-active' : ''}`}
              onClick={() => onTypeFilterChange(opt)}
            >
              {formatLabel(opt)}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default OrderFilters;
