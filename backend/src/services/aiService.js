const SUPPORTED_EXTENSIONS = new Set([
  '.js', '.jsx', '.ts', '.tsx', '.java', '.py', '.go',
  '.rb', '.php', '.cs', '.cpp', '.c', '.swift', '.kt',
  '.vue', '.svelte', '.html', '.css', '.scss',
]);

const MAX_DIFF_CHARS = 12000;

// ── Provider config ────────────────────────────────────────────────────────────
const AI_PROVIDER = process.env.AI_PROVIDER || 'anthropic';
const AI_MODEL = process.env.AI_MODEL || defaultModel(AI_PROVIDER);
const AI_API_KEY = process.env.AI_API_KEY || process.env.ANTHROPIC_API_KEY;

function defaultModel(provider) {
  switch (provider) {
    case 'groq':      return 'llama-3.3-70b-versatile';
    case 'openai':    return 'gpt-4o-mini';
    case 'anthropic':
    default:          return 'claude-haiku-4-5-20251001';
  }
}

// Base URLs for OpenAI-compatible providers
const BASE_URLS = {
  groq:   'https://api.groq.com/openai/v1',
  openai: 'https://api.openai.com/v1',
};

// ── Client factory ─────────────────────────────────────────────────────────────
function createClient() {
  if (AI_PROVIDER === 'anthropic') {
    const Anthropic = require('@anthropic-ai/sdk');
    return new Anthropic({ apiKey: AI_API_KEY });
  }

  const OpenAI = require('openai');
  return new OpenAI({
    apiKey: AI_API_KEY,
    baseURL: process.env.AI_BASE_URL || BASE_URLS[AI_PROVIDER] || BASE_URLS.openai,
  });
}

// ── Unified send ───────────────────────────────────────────────────────────────
async function sendMessage(prompt) {
  const client = createClient();

  if (AI_PROVIDER === 'anthropic') {
    const res = await client.messages.create({
      model: AI_MODEL,
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    });
    return res.content[0].text;
  }

  const res = await client.chat.completions.create({
    model: AI_MODEL,
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  });
  return res.choices[0].message.content;
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function shouldReviewFile(filename) {
  const ext = '.' + filename.split('.').pop().toLowerCase();
  return SUPPORTED_EXTENSIONS.has(ext);
}

function truncateDiff(diff, maxChars = MAX_DIFF_CHARS) {
  if (diff.length <= maxChars) return diff;
  return diff.substring(0, maxChars) + '\n... [diff truncated for length]';
}

function buildReviewPrompt(filename, patch, prContext) {
  return `You are a senior software engineer performing a thorough code review. Be precise and actionable.

PR Context:
- Repository: ${prContext.repo}
- PR Title: ${prContext.title}
- File: ${filename}

Git Diff:
\`\`\`
${truncateDiff(patch)}
\`\`\`

Review this diff and return ONLY a valid JSON array (no markdown, no explanation, just the array).
Each item must have exactly these fields:
{
  "file_path": "${filename}",
  "line_number": <integer line number from the diff, or null if not applicable>,
  "severity": <"critical" | "warning" | "suggestion">,
  "category": <"security" | "performance" | "bug" | "style" | "maintainability" | "best-practice">,
  "comment": <concise actionable comment, max 150 chars>
}

Guidelines:
- "critical": bugs, security vulnerabilities, data loss risks, broken logic
- "warning": performance issues, deprecated patterns, missing error handling
- "suggestion": style improvements, naming, refactoring opportunities

Rules:
- Max 8 comments per file
- Only comment on the CHANGED lines (lines starting with + in the diff)
- Skip trivial whitespace or formatting changes
- If no issues found, return an empty array: []
- Return ONLY the JSON array, nothing else`;
}

// ── Core review logic ──────────────────────────────────────────────────────────
async function reviewFile(filename, patch, prContext) {
  if (!patch || patch.trim() === '') return [];
  if (!shouldReviewFile(filename)) {
    console.log(`  ⏭️  Skipping ${filename} (unsupported file type)`);
    return [];
  }

  try {
    console.log(`  🔍 Reviewing ${filename}...`);
    const responseText = await sendMessage(buildReviewPrompt(filename, patch, prContext));

    const cleaned = responseText
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim();

    const comments = JSON.parse(cleaned);
    console.log(`    ✅ ${comments.length} comments for ${filename}`);
    return Array.isArray(comments) ? comments : [];
  } catch (err) {
    console.error(`    ❌ Error reviewing ${filename}:`, err.message);
    return [];
  }
}

async function reviewPR(files, prContext) {
  console.log(`\n🤖 Starting AI review [${AI_PROVIDER}/${AI_MODEL}] for PR #${prContext.prNumber} in ${prContext.repo}`);
  console.log(`   Files to review: ${files.length}\n`);

  const allComments = [];
  let filesReviewed = 0;

  for (const file of files) {
    if (file.status === 'removed') continue;

    const comments = await reviewFile(file.filename, file.patch, prContext);
    allComments.push(...comments);
    if (comments !== null) filesReviewed++;

    await new Promise((r) => setTimeout(r, 500));
  }

  const critical    = allComments.filter((c) => c.severity === 'critical').length;
  const warnings    = allComments.filter((c) => c.severity === 'warning').length;
  const suggestions = allComments.filter((c) => c.severity === 'suggestion').length;

  console.log(`\n📊 Review complete:`);
  console.log(`   Files reviewed: ${filesReviewed}`);
  console.log(`   🔴 Critical: ${critical}`);
  console.log(`   🟡 Warnings: ${warnings}`);
  console.log(`   💡 Suggestions: ${suggestions}\n`);

  return { comments: allComments, filesReviewed, critical, warnings, suggestions };
}

module.exports = { reviewPR };
