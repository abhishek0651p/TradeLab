import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, LineChart, Star, Briefcase, Settings, Clock, Activity, Brain, History, Shield, Bell } from 'lucide-react';
import { useTrading } from '../context/TradingContext';
import NotificationCenter from './NotificationCenter';

const Sidebar = () => {
  const { unreadNotificationCount } = useTrading();
  const [notifOpen, setNotifOpen] = useState(false);

  const badgeText = unreadNotificationCount > 99 ? '99+' : String(unreadNotificationCount);

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <div className="d16-header-row">
          <h1><Activity color="#3b82f6" /> TradeLab</h1>
          <button
            className="d16-bell-btn"
            onClick={() => setNotifOpen(prev => !prev)}
            aria-label={`Notifications${unreadNotificationCount > 0 ? ` (${unreadNotificationCount} unread)` : ''}`}
          >
            <Bell size={20} />
            {unreadNotificationCount > 0 && (
              <span className="d16-bell-badge">{badgeText}</span>
            )}
          </button>
        </div>
        <span className="sidebar-tag">VIRTUAL ACCOUNT</span>
      </div>

      {/* Activity Center panel */}
      <NotificationCenter isOpen={notifOpen} onClose={() => setNotifOpen(false)} />
      
      <div className="nav-links">
        <NavLink to="/" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          <LayoutDashboard size={20} /> Dashboard
        </NavLink>
        <NavLink to="/markets" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          <LineChart size={20} /> Markets
        </NavLink>
        <NavLink to="/watchlist" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          <Star size={20} /> Watchlist
        </NavLink>
        <NavLink to="/portfolio" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          <Briefcase size={20} /> Portfolio
        </NavLink>
        <NavLink to="/risk" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          <Shield size={20} /> Risk
        </NavLink>

        <NavLink to="/orders" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          <Clock size={20} /> Orders
        </NavLink>
        <NavLink to="/trades" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          <History size={20} /> Trade History
        </NavLink>

        {/* Future milestones */}
        <div style={{ marginTop: '24px', marginBottom: '8px', paddingLeft: '24px', fontSize: '0.75rem', color: 'var(--border)', fontWeight: 600 }}>COMING SOON</div>
        <div className="nav-item" style={{ opacity: 0.5, cursor: 'not-allowed' }}>
          <Activity size={20} /> Algo Trading
        </div>
        <div className="nav-item" style={{ opacity: 0.5, cursor: 'not-allowed' }}>
          <Brain size={20} /> AI Analysis
        </div>
      </div>

      <div style={{ paddingBottom: '16px' }}>
        <NavLink to="/settings" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          <Settings size={20} /> Settings
        </NavLink>
      </div>
    </div>
  );
};

export default Sidebar;
