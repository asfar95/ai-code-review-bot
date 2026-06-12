import React from 'react';
import { Routes, Route, NavLink } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import Reviews from './pages/Reviews';
import ReviewDetail from './pages/ReviewDetail';
import './App.css';

export default function App() {
  return (
    <div className="app">
      <aside className="sidebar">
        <div className="sidebar-logo">
          <span className="logo-icon">🤖</span>
          <div>
            <div className="logo-title">CodeReview AI</div>
            <div className="logo-sub">AI-Powered Reviews</div>
          </div>
        </div>

        <nav className="sidebar-nav">
          <NavLink to="/" end className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
            <span className="nav-icon">📊</span> Dashboard
          </NavLink>
          <NavLink to="/reviews" className={({ isActive }) => isActive ? 'nav-item active' : 'nav-item'}>
            <span className="nav-icon">🔍</span> PR Reviews
          </NavLink>
        </nav>

        <div className="sidebar-footer">
          <a href="https://github.com/asfar95/ai-code-review-bot" target="_blank" rel="noreferrer" className="footer-link">
            View on GitHub →
          </a>
        </div>
      </aside>

      <main className="main-content">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/reviews" element={<Reviews />} />
          <Route path="/reviews/:id" element={<ReviewDetail />} />
        </Routes>
      </main>
    </div>
  );
}
