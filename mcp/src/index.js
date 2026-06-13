const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { z } = require('zod');
const path = require('path');

// Load backend .env
require('dotenv').config({ path: path.resolve(__dirname, '../../backend/.env') });

// Always point at the backend's database regardless of cwd
process.env.DB_PATH = path.resolve(__dirname, '../../backend/data/reviews.db');

const { reviewPR } = require('../../backend/src/services/aiService');
const { getPRFiles } = require('../../backend/src/services/githubService');
const { getAllReviews, getReviewById, getStats, initDb } = require('../../backend/src/db');

initDb();

const server = new McpServer({
  name: 'ai-code-review',
  version: '1.0.0',
});

// ── Tool 1: review_pr ──────────────────────────────────────────────────────────
server.tool(
  'review_pr',
  'Review a GitHub pull request. Returns severity-ranked inline comments across all changed files.',
  {
    owner:     z.string().describe('GitHub repository owner (e.g. "asfar95")'),
    repo:      z.string().describe('GitHub repository name (e.g. "ai-agent-playground")'),
    pr_number: z.number().describe('Pull request number'),
  },
  async ({ owner, repo, pr_number }) => {
    const files = await getPRFiles(owner, repo, pr_number);

    if (!files.length) {
      return { content: [{ type: 'text', text: 'No reviewable files found in this PR.' }] };
    }

    const prContext = {
      repo: `${owner}/${repo}`,
      title: `PR #${pr_number}`,
      prNumber: pr_number,
    };

    const { comments, filesReviewed, critical, warnings, suggestions } =
      await reviewPR(files, prContext);

    return { content: [{ type: 'text', text: formatReview(comments, filesReviewed, critical, warnings, suggestions) }] };
  }
);

// ── Tool 2: review_code ────────────────────────────────────────────────────────
server.tool(
  'review_code',
  'Review a raw code snippet. Returns AI feedback with severity and category for each issue found.',
  {
    code:     z.string().describe('The code to review'),
    filename: z.string().describe('Filename with extension so the reviewer knows the language (e.g. "index.js", "main.py")'),
  },
  async ({ code, filename }) => {
    const lines = code.split('\n');
    const patch = `@@ -0,0 +1,${lines.length} @@\n` + lines.map(l => `+${l}`).join('\n');

    const mockFile = {
      filename,
      status: 'added',
      patch,
      additions: lines.length,
      deletions: 0,
    };

    const prContext = { repo: 'snippet', title: 'Code Snippet Review', prNumber: 0 };
    const { comments, filesReviewed, critical, warnings, suggestions } =
      await reviewPR([mockFile], prContext);

    return { content: [{ type: 'text', text: formatReview(comments, filesReviewed, critical, warnings, suggestions) }] };
  }
);

// ── Tool 3: get_review_history ─────────────────────────────────────────────────
server.tool(
  'get_review_history',
  'Fetch past PR reviews stored in the local database. Optionally filter by repo.',
  {
    repo:  z.string().optional().describe('Filter by repo full name (e.g. "asfar95/ai-agent-playground")'),
    limit: z.number().optional().describe('Max results to return (default 10)'),
  },
  async ({ repo, limit = 10 }) => {
    let reviews = getAllReviews();

    if (repo) {
      reviews = reviews.filter(r => r.repo_full_name === repo);
    }

    reviews = reviews.slice(0, limit);

    if (!reviews.length) {
      return { content: [{ type: 'text', text: 'No reviews found.' }] };
    }

    const lines = reviews.map(r =>
      `PR #${r.pr_number} — ${r.repo_full_name} — "${r.title}" | ` +
      `🔴 ${r.critical_count} critical  🟡 ${r.warning_count} warnings  💡 ${r.suggestion_count} suggestions | ` +
      `${r.status} at ${r.reviewed_at || r.created_at}`
    );

    return { content: [{ type: 'text', text: lines.join('\n') }] };
  }
);

// ── Tool 4: get_review_stats ───────────────────────────────────────────────────
server.tool(
  'get_review_stats',
  'Get aggregate statistics from all past reviews — totals, severity breakdown, and 7-day activity.',
  {},
  async () => {
    const stats = getStats();

    const text = [
      `📊 Review Statistics`,
      `──────────────────────────────`,
      `Total PRs tracked : ${stats.total_prs}`,
      `PRs reviewed      : ${stats.reviewed_prs}`,
      `🔴 Critical issues : ${stats.total_critical || 0}`,
      `🟡 Warnings        : ${stats.total_warnings || 0}`,
      `💡 Suggestions     : ${stats.total_suggestions || 0}`,
      ``,
      `Top repos:`,
      ...(stats.top_repos.map(r => `  ${r.repo_full_name} — ${r.pr_count} PRs, ${r.total_issues} issues`)),
      ``,
      `7-day activity:`,
      ...(stats.recent_activity.map(d => `  ${d.date} — ${d.prs} PRs, ${d.comments} comments`)),
    ].join('\n');

    return { content: [{ type: 'text', text }] };
  }
);

// ── Formatter ──────────────────────────────────────────────────────────────────
function formatReview(comments, filesReviewed, critical, warnings, suggestions) {
  const lines = [
    `## 🤖 AI Code Review`,
    `Files reviewed: ${filesReviewed} | 🔴 ${critical} critical  🟡 ${warnings} warnings  💡 ${suggestions} suggestions`,
    '',
  ];

  if (!comments.length) {
    lines.push('✅ No issues found.');
    return lines.join('\n');
  }

  const bySeverity = ['critical', 'warning', 'suggestion'];
  const icons = { critical: '🔴', warning: '🟡', suggestion: '💡' };

  for (const severity of bySeverity) {
    const group = comments.filter(c => c.severity === severity);
    if (!group.length) continue;

    lines.push(`### ${icons[severity]} ${severity.charAt(0).toUpperCase() + severity.slice(1)}s`);
    for (const c of group) {
      lines.push(`- **${c.file_path}** (line ${c.line_number || 'N/A'}) [${c.category}]: ${c.comment}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

// ── Start ──────────────────────────────────────────────────────────────────────
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('🔌 AI Code Review MCP server running');
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
