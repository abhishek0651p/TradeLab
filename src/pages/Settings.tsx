import React from 'react';
import { useTrading } from '../context/TradingContext';
import { Settings as SettingsIcon, RefreshCcw } from 'lucide-react';

const Settings = () => {
  const { resetAccount } = useTrading();

  const handleReset = () => {
    if (window.confirm('Are you sure you want to reset your virtual account? This will erase all your watchlist items, positions, and reset your balance to ₹10,00,000. This action cannot be undone.')) {
      resetAccount();
      alert('Virtual account has been reset.');
    }
  };

  return (
    <div>
      <h1 className="page-title">Settings</h1>
      
      <div className="card" style={{ maxWidth: '600px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
          <SettingsIcon size={24} color="var(--primary)" />
          <h2 style={{ fontSize: '1.25rem' }}>Account Preferences</h2>
        </div>
        
        <div style={{ marginBottom: '32px' }}>
          <h3 style={{ marginBottom: '8px', fontSize: '1rem' }}>Account Reset</h3>
          <p style={{ color: 'var(--text-muted)', marginBottom: '16px', fontSize: '0.9rem' }}>
            Reset your virtual account back to its initial state with ₹10,00,000 starting capital.
          </p>
          <button className="btn btn-outline" onClick={handleReset} style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }}>
            <RefreshCcw size={16} /> Reset Virtual Account
          </button>
        </div>

        <div>
          <h3 style={{ marginBottom: '8px', fontSize: '1rem' }}>About TradeLab</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: '1.6' }}>
            TradeLab is a virtual paper trading platform designed for educational purposes. 
            All data and balances shown are simulated. This application does not connect to 
            any real brokers or financial institutions.
          </p>
        </div>
      </div>
    </div>
  );
};

export default Settings;
