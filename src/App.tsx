import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { TradingProvider } from './context/TradingContext';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import Markets from './pages/Markets';
import Watchlist from './pages/Watchlist';
import Portfolio from './pages/Portfolio';
import Settings from './pages/Settings';

function App() {
  return (
    <TradingProvider>
      <Router>
        <div className="app-container">
          <Sidebar />
          <main className="main-content">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/markets" element={<Markets />} />
              <Route path="/watchlist" element={<Watchlist />} />
              <Route path="/portfolio" element={<Portfolio />} />
              <Route path="/settings" element={<Settings />} />
            </Routes>
          </main>
        </div>
      </Router>
    </TradingProvider>
  );
}

export default App;
