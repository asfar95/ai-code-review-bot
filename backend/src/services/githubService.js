const crypto = require('crypto');
const { Octokit } = require('@octokit/rest');

const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN,
});

/**
 * Verify GitHub webhook signature
 */
function verifyWebhookSignature(payload, signature) {
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  if (!secret) {
    console.warn('⚠️  No GITHUB_WEBHOOK_SECRET set — skipping signature verification');
    return true;
  }
  if (!signature) return false;

  const hmac = crypto.createHmac('sha256', secret);
  const digest = 'sha256=' + hmac.update(payload).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(signature));
}

/**
 * Fetch all file diffs for a given PR
 */
async function getPRFiles(owner, repo, pullNumber) {
  try {
    const { data } = await octokit.pulls.listFiles({
      owner,
      repo,
      pull_number: pullNumber,
      per_page: 30, // limit to 30 files to avoid token overflow
    });

    return data.map((file) => ({
      filename: file.filename,
      status: file.status, // added, modified, removed
      additions: file.additions,
      deletions: file.deletions,
      patch: file.patch || '', // the actual diff
    }));
  } catch (err) {
    console.error('Error fetching PR files:', err.message);
    return [];
  }
}

/**
 * Post a review comment on a specific line of a PR
 */
async function postReviewComment(owner, repo, pullNumber, commitId, path, line, body) {
  try {
    await octokit.pulls.createReviewComment({
      owner,
      repo,
      pull_number: pullNumber,
      commit_id: commitId,
      path,
      line,
      body,
    });
  } catch (err) {
    // Line-level comments can fail if line isn't in the diff — fall back to PR comment
    console.warn(`Could not post inline comment on ${path}:${line} — ${err.message}`);
  }
}

/**
 * Post a general PR review summary (not inline)
 */
async function submitPRReview(owner, repo, pullNumber, commitId, reviewBody, comments) {
  try {
    // Build inline comments array for the review
    const reviewComments = comments
      .filter((c) => c.line_number && c.line_number > 0)
      .slice(0, 20) // GitHub limits inline comments per review
      .map((c) => ({
        path: c.file_path,
        line: c.line_number,
        body: formatComment(c),
      }));

    await octokit.pulls.createReview({
      owner,
      repo,
      pull_number: pullNumber,
      commit_id: commitId,
      body: reviewBody,
      event: 'COMMENT', // APPROVE / REQUEST_CHANGES / COMMENT
      comments: reviewComments,
    });

    console.log(`✅ Posted review on PR #${pullNumber}`);
  } catch (err) {
    console.error('Error submitting PR review:', err.message);
    // Fallback: post as a plain issue comment
    await postIssueComment(owner, repo, pullNumber, reviewBody);
  }
}

/**
 * Post a plain comment on the PR (fallback)
 */
async function postIssueComment(owner, repo, pullNumber, body) {
  try {
    await octokit.issues.createComment({
      owner,
      repo,
      issue_number: pullNumber,
      body,
    });
  } catch (err) {
    console.error('Error posting issue comment:', err.message);
  }
}

/**
 * Get the latest commit SHA on a PR
 */
async function getPRCommitSha(owner, repo, pullNumber) {
  try {
    const { data } = await octokit.pulls.get({
      owner,
      repo,
      pull_number: pullNumber,
    });
    return data.head.sha;
  } catch (err) {
    console.error('Error fetching PR commit SHA:', err.message);
    return null;
  }
}

/**
 * Format a comment with severity emoji
 */
function formatComment(comment) {
  const icons = {
    critical: '🔴 **Critical**',
    warning: '🟡 **Warning**',
    suggestion: '💡 **Suggestion**',
  };
  const icon = icons[comment.severity] || '💬 **Comment**';
  return `${icon}: ${comment.comment}`;
}

/**
 * Build the PR review summary body
 */
function buildReviewSummary(comments, filesReviewed) {
  const critical = comments.filter((c) => c.severity === 'critical').length;
  const warnings = comments.filter((c) => c.severity === 'warning').length;
  const suggestions = comments.filter((c) => c.severity === 'suggestion').length;

  let summary = `## 🤖 AI Code Review Summary\n\n`;
  summary += `> Reviewed by **AI Code Review Bot**\n\n`;
  summary += `### Results\n`;
  summary += `| Metric | Count |\n|--------|-------|\n`;
  summary += `| 📁 Files Reviewed | ${filesReviewed} |\n`;
  summary += `| 🔴 Critical Issues | ${critical} |\n`;
  summary += `| 🟡 Warnings | ${warnings} |\n`;
  summary += `| 💡 Suggestions | ${suggestions} |\n\n`;

  if (critical > 0) {
    summary += `### 🔴 Critical Issues\n`;
    comments
      .filter((c) => c.severity === 'critical')
      .forEach((c) => {
        summary += `- **${c.file_path}** (line ${c.line_number || 'N/A'}): ${c.comment}\n`;
      });
    summary += '\n';
  }

  if (comments.length === 0) {
    summary += `✅ **No issues found.** Looks good to merge!\n`;
  }

  summary += `\n---\n*Powered by [AI Code Review Bot](https://github.com/asfar95/ai-code-review-bot)*`;
  return summary;
}

module.exports = {
  verifyWebhookSignature,
  getPRFiles,
  submitPRReview,
  postIssueComment,
  getPRCommitSha,
  buildReviewSummary,
  formatComment,
};
