const crypto = require('crypto');
const { Octokit } = require('@octokit/rest');

const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN,
});

/**
 * Verify GitHub webhook signature
 */
function verifyWebhookSignature(payload, signature) {
  if (!signature) return false;
  const digest = 'sha256=' + crypto.createHmac('sha256', process.env.GITHUB_WEBHOOK_SECRET).update(payload).digest('hex');
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
/**
 * Parse the lines on the RIGHT side (new file) that appear in a diff patch.
 * GitHub only allows inline comments on lines present in the diff.
 */
function parseValidLines(patch) {
  const valid = new Set();
  if (!patch) return valid;
  let newLine = 0;
  for (const line of patch.split('\n')) {
    const hunk = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunk) {
      newLine = parseInt(hunk[1], 10) - 1; // will be incremented on first real line
      continue;
    }
    if (line.startsWith('-')) continue; // old side only — don't increment newLine
    newLine++;
    if (line.startsWith('+') || line.startsWith(' ')) valid.add(newLine);
  }
  return valid;
}

async function submitPRReview(owner, repo, pullNumber, commitId, reviewBody, comments, files = []) {
  // Build a map of filename → valid line numbers from the actual diff
  const validLineMap = {};
  for (const f of files) {
    validLineMap[f.filename] = parseValidLines(f.patch);
  }

  const inline = [];
  const overflow = [];

  for (const c of comments) {
    if (!c.line_number || c.line_number <= 0) { overflow.push(c); continue; }
    const validLines = validLineMap[c.file_path];
    if (validLines && validLines.has(c.line_number)) {
      inline.push(c);
    } else {
      overflow.push(c);
    }
  }

  // Append out-of-diff comments to the review body so nothing is lost
  let fullBody = reviewBody;
  if (overflow.length > 0) {
    fullBody += '\n\n---\n**Additional notes (outside diff):**\n';
    for (const c of overflow) {
      fullBody += `\n- **${c.file_path}** (line ${c.line_number ?? 'N/A'}): ${formatComment(c)}`;
    }
  }

  try {
    await octokit.pulls.createReview({
      owner,
      repo,
      pull_number: pullNumber,
      commit_id: commitId,
      body: fullBody,
      event: 'COMMENT',
      comments: inline.slice(0, 20).map((c) => ({
        path: c.file_path,
        line: c.line_number,
        body: formatComment(c),
      })),
    });
    console.log(`✅ Posted review on PR #${pullNumber} (${inline.length} inline, ${overflow.length} in body)`);
  } catch (err) {
    console.error('Error submitting PR review:', err.message);
    await postIssueComment(owner, repo, pullNumber, fullBody);
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

  if (comments.length === 0) {
    summary += `✅ **No issues found.** Looks good to merge!\n`;
  } else {
    summary += `> Inline comments are posted directly on the relevant lines below.\n`;
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
