import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { useReviews } from '../hooks/useApi';
import './Reviews.css';

const SEVERITY_FILTER = ['all', 'critical', 'warning', 'clean'];

export default function Reviews() {
  const { reviews, loading, refetch } = useReviews();
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');

  const filtered = reviews.filter((r) => {
    const matchSearch =
      !search ||
      r.title?.toLowerCase().includes(search.toLowerCase()) ||
      r.repo_full_name?.toLowerCase().includes(search.toLowerCase()) ||
      r.author?.toLowerCase().includes(search.toLowerCase());

    const matchFilter =
      filter === 'all' ||
      (filter === 'critical' && r.critical_count > 0) ||
      (filter === 'warning' && r.warning_count > 0 && r.critical_count === 0) ||
      (filter === 'clean' && r.total_comments === 0);

    return matchSearch && matchFilter;
  });

  return (
    <div className="reviews-page">
      <div className="page-header">
        <h1 className="page-title">PR Reviews</h1>
        <p className="page-sub">All pull requests reviewed by the AI bot</p>
      </div>

      {/* Filters */}
      <div className="reviews-toolbar">
        <input
          className="search-input"
          placeholder="Search by title, repo, or author..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="filter-tabs">
          {SEVERITY_FILTER.map((f) => (
            <button
              key={f}
              className={`filter-tab ${filter === f ? 'active' : ''}`}
              onClick={() => setFilter(f)}
            >
              {f === 'all' ? 'All' : f === 'clean' ? '✅ Clean' : f === 'critical' ? '🔴 Critical' : '🟡 Warnings'}
            </button>
          ))}
        </div>
        <button className="refresh-btn" onClick={refetch}>↻ Refresh</button>
      </div>

      {/* List */}
      {loading ? (
        <div className="loading"><div className="spinner" /> Loading reviews...</div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">🔍</div>
          <p>{search ? 'No reviews match your search.' : 'No reviews yet. Open a PR to trigger a review.'}</p>
        </div>
      ) : (
        <div className="reviews-list">
          {filtered.map((r) => (
            <Link to={`/reviews/${r.id}`} key={r.id} className="review-card">
              <div className="review-card-top">
                <div className="review-pr-info">
                  <span className="pr-num">#{r.pr_number}</span>
                  <span className="pr-title">{r.title || 'Untitled PR'}</span>
                </div>
                <span className={`badge ${r.status}`}>{r.status}</span>
              </div>

              <div className="review-card-meta">
                <span className="meta-item">📁 {r.repo_full_name}</span>
                <span className="meta-item">👤 @{r.author}</span>
                <span className="meta-item">🗂 {r.files_reviewed} files</span>
                <span className="meta-item">
                  {r.reviewed_at
                    ? formatDistanceToNow(new Date(r.reviewed_at), { addSuffix: true })
                    : 'pending'}
                </span>
              </div>

              <div className="review-card-badges">
                {r.critical_count > 0 && (
                  <span className="badge critical">🔴 {r.critical_count} critical</span>
                )}
                {r.warning_count > 0 && (
                  <span className="badge warning">🟡 {r.warning_count} warnings</span>
                )}
                {r.suggestion_count > 0 && (
                  <span className="badge suggestion">💡 {r.suggestion_count} suggestions</span>
                )}
                {r.total_comments === 0 && r.status === 'reviewed' && (
                  <span className="badge reviewed">✅ No issues found</span>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
