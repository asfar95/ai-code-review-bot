const express = require('express');
const router = express.Router();
const { verifyWebhookSignature, getPRFiles, submitPRReview, getPRCommitSha, buildReviewSummary } = require('../services/githubService');
const { reviewPR } = require('../services/aiService');
const { savePullRequest, updatePullRequest, saveReviewComments } = require('../db');

router.post('/', async (req, res) => {
  const signature = req.headers['x-hub-signature-256'];
  const event = req.headers['x-github-event'];

  // Verify signature
  if (!verifyWebhookSignature(req.body, signature)) {
    console.warn('❌ Invalid webhook signature');
    return res.status(401).json({ error: 'Invalid signature' });
  }

  // Only handle pull_request events
  if (event !== 'pull_request') {
    return res.status(200).json({ message: `Ignored event: ${event}` });
  }

  let payload;
  try {
    payload = JSON.parse(req.body.toString());
  } catch (err) {
    return res.status(400).json({ error: 'Invalid JSON payload' });
  }

  const { action, pull_request, repository } = payload;

  // Only review when PR is opened or new commits pushed (synchronize)
  if (!['opened', 'synchronize', 'reopened'].includes(action)) {
    return res.status(200).json({ message: `Ignored action: ${action}` });
  }

  const owner = repository.owner.login;
  const repo = repository.name;
  const repoFullName = repository.full_name;
  const prNumber = pull_request.number;
  const prTitle = pull_request.title;
  const prAuthor = pull_request.user.login;
  const prUrl = pull_request.html_url;

  console.log(`\n📬 Received PR event: ${action} #${prNumber} "${prTitle}" by @${prAuthor}`);

  // Acknowledge webhook immediately (GitHub expects <10s response)
  res.status(200).json({ message: 'Review started', pr: prNumber });

  // Run review asynchronously
  try {
    // Save PR to DB
    const prId = savePullRequest({
      pr_number: prNumber,
      repo_full_name: repoFullName,
      title: prTitle,
      author: prAuthor,
      status: 'reviewing',
      pr_url: prUrl,
    });

    // Fetch diff files
    const files = await getPRFiles(owner, repo, prNumber);
    const commitSha = await getPRCommitSha(owner, repo, prNumber);

    if (!files.length) {
      updatePullRequest(prId, {
        status: 'reviewed',
        files_reviewed: 0,
        total_comments: 0,
        critical_count: 0,
        warning_count: 0,
        suggestion_count: 0,
      });
      return;
    }

    // Run AI review
    const prContext = { repo: repoFullName, title: prTitle, prNumber };
    const { comments, filesReviewed, critical, warnings, suggestions } = await reviewPR(files, prContext);

    // Save comments to DB
    if (comments.length > 0) {
      saveReviewComments(prId, comments);
    }

    // Update PR record
    updatePullRequest(prId, {
      status: 'reviewed',
      files_reviewed: filesReviewed,
      total_comments: comments.length,
      critical_count: critical,
      warning_count: warnings,
      suggestion_count: suggestions,
    });

    // Post review back to GitHub
    const reviewBody = buildReviewSummary(comments, filesReviewed);
    if (commitSha) {
      await submitPRReview(owner, repo, prNumber, commitSha, reviewBody, comments);
    }
  } catch (err) {
    console.error('❌ Error during review pipeline:', err);
  }
});

module.exports = router;
