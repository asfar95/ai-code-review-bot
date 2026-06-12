import React from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts';
import { useStats, useReviews } from '../hooks/useApi';
import { formatDistanceToNow } from 'date-fns';
import { Link } from 'react-router-dom';
import './Dashboard.css';

const SEVERITY_COLORS = {
  critical: '#f85149',
  warning: '#d29922',
  suggestion: '#3fb950',
};

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip">
      <div className="tooltip-label">{label}</div>
      {payload.map((p) => (
        <div key={p.name} style={{ color: p.color }}>
          {p.name}: {p.value}
        </div>
      ))}
    </div>
  );
};

export default function Dashboard() {
  const { stats, loading: statsLoading } = useStats();
  const { reviews, loading: reviewsLoading } = useReviews();

  if (statsLoading) {
    return <div className="loading"><div className="spinner" /> Loading dashboard...</div>;
  }

  const pieData = stats
    ? [
        { name: 'Critical', value: stats.total_critical || 0, color: SEVERITY_COLORS.critical },
        { name: 'Warnings', value: stats.total_warnings || 0, color: SEVERITY_COLORS.warning },
        { name: 'Suggestions', value: stats.total_suggestions || 0, color: SEVERITY_COLORS.suggestion },
      ].filter((d) => d.value > 0)
    : [];

  const recentActivity = stats?.recent_activity || [];

  return (
    <div className="dashboard">
      <div className="page-header">
        <h1 className="page-title">Dashboard</h1>
        <p className="page-sub">Overview of all AI-powered code reviews</p>
      </div>

      {/* Stat Cards */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">TOTAL PRs REVIEWED</div>
          <div className="stat-value">{stats?.reviewed_prs ?? 0}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">CRITICAL ISSUES</div>
          <div className="stat-value critical">{stats?.total_critical ?? 0}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">WARNINGS</div>
          <div className="stat-value warning">{stats?.total_warnings ?? 0}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">SUGGESTIONS</div>
          <div className="stat-value suggestion">{stats?.total_suggestions ?? 0}</div>
        </div>
      </div>

      {/* Charts Row */}
      <div className="charts-row">
        {/* Activity chart */}
        <div className="card chart-card">
          <div className="card-title">Activity — Last 7 Days</div>
          {recentActivity.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">📭</div>
              <p>No activity yet. Open a PR to trigger a review.</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={recentActivity} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <XAxis dataKey="date" tick={{ fill: '#8b949e', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#8b949e', fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="prs" name="PRs" fill="#58a6ff" radius={[4, 4, 0, 0]} />
                <Bar dataKey="comments" name="Comments" fill="#3fb950" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Severity pie */}
        <div className="card chart-card chart-card--sm">
          <div className="card-title">Issues by Severity</div>
          {pieData.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">🥧</div>
              <p>No issues recorded yet.</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={85}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {pieData.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
                <Legend
                  iconType="circle"
                  iconSize={8}
                  formatter={(v) => <span style={{ color: '#8b949e', fontSize: 12 }}>{v}</span>}
                />
                <Tooltip formatter={(v, n) => [v, n]} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Top Repos */}
      {stats?.top_repos?.length > 0 && (
        <div className="card" style={{ marginBottom: 24 }}>
          <div className="card-title">Top Repositories</div>
          <table className="data-table">
            <thead>
              <tr>
                <th>Repository</th>
                <th>PRs</th>
                <th>Total Issues</th>
              </tr>
            </thead>
            <tbody>
              {stats.top_repos.map((r) => (
                <tr key={r.repo_full_name}>
                  <td className="mono">{r.repo_full_name}</td>
                  <td>{r.pr_count}</td>
                  <td>{r.total_issues}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Recent Reviews */}
      <div className="card">
        <div className="card-title">Recent Reviews</div>
        {reviewsLoading ? (
          <div className="loading"><div className="spinner" /></div>
        ) : reviews.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">🔍</div>
            <p>No reviews yet. Set up the GitHub webhook to get started.</p>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>PR</th>
                <th>Repository</th>
                <th>Author</th>
                <th>Status</th>
                <th>Issues</th>
                <th>Reviewed</th>
              </tr>
            </thead>
            <tbody>
              {reviews.slice(0, 8).map((r) => (
                <tr key={r.id}>
                  <td>
                    <Link to={`/reviews/${r.id}`} className="pr-link">
                      #{r.pr_number} {r.title?.slice(0, 40)}{r.title?.length > 40 ? '…' : ''}
                    </Link>
                  </td>
                  <td className="mono text-muted">{r.repo_full_name}</td>
                  <td className="text-muted">@{r.author}</td>
                  <td><span className={`badge ${r.status}`}>{r.status}</span></td>
                  <td>
                    <span className="issue-counts">
                      {r.critical_count > 0 && <span className="badge critical">🔴 {r.critical_count}</span>}
                      {r.warning_count > 0 && <span className="badge warning">🟡 {r.warning_count}</span>}
                      {r.suggestion_count > 0 && <span className="badge suggestion">💡 {r.suggestion_count}</span>}
                      {r.total_comments === 0 && <span className="badge reviewed">✅ Clean</span>}
                    </span>
                  </td>
                  <td className="text-muted">
                    {r.reviewed_at
                      ? formatDistanceToNow(new Date(r.reviewed_at), { addSuffix: true })
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
