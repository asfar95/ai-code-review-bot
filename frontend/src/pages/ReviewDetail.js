import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { useReviewDetail } from '../hooks/useApi';
import './ReviewDetail.css';

const SEVERITY_ICON = { critical: '🔴', warning: '🟡', suggestion: '💡' };
const CATEGORY_LABEL = {
  security: '🔒 Security',
  performance: '⚡ Performance',
  bug: '🐛 Bug',
  style: '🎨 Style',
  maintainability: '🔧 Maintainability',
  'best-practice': '📘 Best Practice',
};

function CommentCard({ comment }) {
  return (
    <div className={`comment-card comment-card--${comment.severity}`}>
      <div className="comment-header">
        <span className={`badge ${comment.severity}`}>
          {SEVERITY_ICON[comment.severity]} {comment.severity}
        </span>
        {comment.category && (
          <span className="comment-category">{CATEGORY_LABEL[comment.category] || comment.category}</span>
        )}
        {comment.line_number && (
          <span className="comment-line mono">Line {comment.line_number}</span>
        )}
      </div>
      <p className="comment-text">{comment.comment}</p>
    </div>
  );
}

function FileGroup({ filePath, comments }) {
  const [open, setOpen] = useState(true);
  const critical = comments.filter((c) => c.severity === 'critical').length;
  const warnings = comments.filter((c) => c.severity === 'warning').length;

  return (
    <div className="file-group">
      <button className="file-header" onClick={() => setOpen((o) => !o)}>
        <span className="file-toggle">{open ? '▾' : '▸'}</span>
        <span className="file-path mono">{filePath}</span>
        <div className="file-badges">
          {critical > 0 && <span className="badge critical">🔴 {critical}</span>}
          {warnings > 0 && <span className="badge warning">🟡 {warnings}</span>}
          <span className="comment-count">{comments.length} comment{comments.length !== 1 ? 's' : ''}</span>
        </div>
      </button>
      {open && (
        <div className="file-comments">
          {comments.map((c) => <CommentCard key={c.id} comment={c} />)}
        </div>
      )}
    </div>
  );
}

export default function ReviewDetail() {
  const { id } = useParams();
  const { review, loading } = useReviewDetail(id);
  const [severityFilter, setSeverityFilter] = useState('all');

  if (loading) return <div className="loading"><div className="spinner" /> Loading review...</div>;
  if (!review) return <div className="loading">Review not found.</div>;

  // Group comments by file
  const commentsByFile = {};
  (review.comments || []).forEach((c) => {
    if (severityFilter !== 'all' && c.severity !== severityFilter) return;
    if (!commentsByFile[c.file_path]) commentsByFile[c.file_path] = [];
    commentsByFile[c.file_path].push(c);
  });

  const hasComments = review.comments?.length > 0;

  return (
    <div className="review-detail">
      {/* Back */}
      <Link to="/reviews" className="back-link">← Back to Reviews</Link>

      {/* Header */}
      <div className="detail-header card">
        <div className="detail-header-top">
          <div>
            <div className="detail-pr-num">PR #{review.pr_number}</div>
            <h1 className="detail-title">{review.title || 'Untitled PR'}</h1>
            <div className="detail-meta">
              <span>📁 {review.repo_full_name}</span>
              <span>👤 @{review.author}</span>
              <span>
                {review.reviewed_at
                  ? `Reviewed ${formatDistanceToNow(new Date(review.reviewed_at), { addSuffix: true })}`
                  : 'Pending review'}
              </span>
            </div>
          </div>
          <div className="detail-stats">
            <div className="detail-stat">
              <div className="detail-stat-val">{review.files_reviewed}</div>
              <div className="detail-stat-label">Files</div>
            </div>
            <div className="detail-stat">
              <div className="detail-stat-val critical">{review.critical_count}</div>
              <div className="detail-stat-label">Critical</div>
            </div>
            <div className="detail-stat">
              <div className="detail-stat-val warning">{review.warning_count}</div>
              <div className="detail-stat-label">Warnings</div>
            </div>
            <div className="detail-stat">
              <div className="detail-stat-val suggestion">{review.suggestion_count}</div>
              <div className="detail-stat-label">Suggestions</div>
            </div>
          </div>
        </div>

        {review.pr_url && (
          <a href={review.pr_url} target="_blank" rel="noreferrer" className="view-on-github">
            View on GitHub ↗
          </a>
        )}
      </div>

      {/* Filter */}
      {hasComments && (
        <div className="severity-filter">
          {['all', 'critical', 'warning', 'suggestion'].map((s) => (
            <button
              key={s}
              className={`filter-tab ${severityFilter === s ? 'active' : ''}`}
              onClick={() => setSeverityFilter(s)}
            >
              {s === 'all' ? 'All Comments' : `${SEVERITY_ICON[s]} ${s}`}
            </button>
          ))}
        </div>
      )}

      {/* Comments by file */}
      {!hasComments ? (
        <div className="card empty-state" style={{ marginTop: 20 }}>
          <div className="empty-icon">✅</div>
          <p>No issues found in this PR. Looks clean!</p>
        </div>
      ) : Object.keys(commentsByFile).length === 0 ? (
        <div className="card empty-state" style={{ marginTop: 20 }}>
          <div className="empty-icon">🔍</div>
          <p>No comments match this filter.</p>
        </div>
      ) : (
        <div className="files-list">
          {Object.entries(commentsByFile).map(([filePath, comments]) => (
            <FileGroup key={filePath} filePath={filePath} comments={comments} />
          ))}
        </div>
      )}
    </div>
  );
}
