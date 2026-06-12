const SUPPORTED_EXTENSIONS = new Set([
  '.js', '.jsx', '.ts', '.tsx', '.java', '.py', '.go',
  '.rb', '.php', '.cs', '.cpp', '.c', '.swift', '.kt',
  '.vue', '.svelte', '.html', '.css', '.scss',
]);

const MAX_DIFF_CHARS = 12000;
const MAX_TOKENS = 2048;

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

// ── Unified send (system + user split) ────────────────────────────────────────
async function sendMessage(systemPrompt, userPrompt) {
  const client = createClient();

  if (AI_PROVIDER === 'anthropic') {
    const res = await client.messages.create({
      model: AI_MODEL,
      max_tokens: MAX_TOKENS,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });
    return res.content[0].text;
  }

  const res = await client.chat.completions.create({
    model: AI_MODEL,
    max_tokens: MAX_TOKENS,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
  });
  return res.choices[0].message.content;
}

// ── Prompt builders ────────────────────────────────────────────────────────────
function buildSystemPrompt() {
  return `You are a senior software engineer performing thorough, production-quality code reviews.
Your job is to catch real problems: security vulnerabilities, bugs, data loss risks, and performance issues.
Be precise, actionable, and direct. Do not praise or summarize — only flag problems.
Always return ONLY a valid JSON array. No markdown, no explanation, no text outside the array.`;
}

function buildUserPrompt(filename, patch, prContext) {
  const descriptionBlock = prContext.description
    ? `PR Description:\n${prContext.description.slice(0, 500)}\n`
    : '';

  return `PR Context:
- Repository: ${prContext.repo}
- PR Title: ${prContext.title}
${descriptionBlock}
File: ${filename}

Git Diff:
\`\`\`
${truncateDiff(patch)}
\`\`\`

Review the changed lines (lines starting with +) and return a JSON array of issues found.
Each item must have exactly these fields:
{
  "file_path": "${filename}",
  "line_number": <integer from the diff, or null>,
  "severity": <"critical" | "warning" | "suggestion">,
  "category": <"security" | "performance" | "bug" | "style" | "maintainability" | "best-practice">,
  "comment": <actionable explanation of the issue and how to fix it, max 300 chars>
}

Severity guide:
- "critical": security vulnerabilities, data loss, broken logic, exposed secrets
- "warning": missing error handling, deprecated patterns, performance problems
- "suggestion": style, naming, refactoring opportunities

Rules:
- Max 8 comments per file
- Only flag CHANGED lines (starting with + in the diff)
- Skip trivial whitespace or formatting changes
- Return [] if no real issues found`;
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

function extractJSON(text) {
  // Try direct parse first
  try {
    return JSON.parse(text.trim());
  } catch {}

  // Strip markdown fences
  const stripped = text
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
  try {
    return JSON.parse(stripped);
  } catch {}

  // Find first [ ... ] block in the response as a last resort
  const match = stripped.match(/\[[\s\S]*\]/);
  if (match) {
    try {
      return JSON.parse(match[0]);
    } catch {}
  }

  return null;
}

// ── Core review logic ──────────────────────────────────────────────────────────
async function reviewFile(filename, patch, prContext) {
  if (!patch || patch.trim() === '') return [];
  if (!shouldReviewFile(filename)) {
    console.log(`  ⏭️  Skipping ${filename} (unsupported file type)`);
    return null; // null = skipped, [] = reviewed with no issues
  }

  try {
    console.log(`  🔍 Reviewing ${filename}...`);
    const responseText = await sendMessage(
      buildSystemPrompt(),
      buildUserPrompt(filename, patch, prContext)
    );

    const comments = extractJSON(responseText);

    if (!Array.isArray(comments)) {
      console.warn(`    ⚠️  Could not parse response for ${filename} — skipping`);
      return [];
    }

    console.log(`    ✅ ${comments.length} comments for ${filename}`);
    return comments;
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

    if (comments === null) continue; // skipped file type — don't count it
    allComments.push(...comments);
    filesReviewed++;

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
