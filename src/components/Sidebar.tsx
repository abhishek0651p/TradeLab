import React from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, LineChart, Star, Briefcase, Settings, Clock, Activity, Brain, History } from 'lucide-react';

const Sidebar = () => {
  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <h1><Activity color="#3b82f6" /> TradeLab</h1>
        <span className="sidebar-tag">VIRTUAL ACCOUNT</span>
      </div>
      
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
