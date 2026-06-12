const SUPPORTED_EXTENSIONS = new Set([
  '.js', '.jsx', '.ts', '.tsx', '.java', '.py', '.go',
  '.rb', '.php', '.cs', '.cpp', '.c', '.swift', '.kt',
  '.vue', '.svelte', '.html', '.css', '.scss',
]);

const MAX_DIFF_CHARS = 12000;
const MAX_TOKENS = 2048;

// ── Provider registry — add any OpenAI-compatible provider here ────────────────
const PROVIDERS = {
  anthropic:  { baseURL: null,                                                        model: 'claude-haiku-4-5-20251001' },
  openai:     { baseURL: 'https://api.openai.com/v1',                                 model: 'gpt-4o-mini' },
  groq:       { baseURL: 'https://api.groq.com/openai/v1',                            model: 'llama-3.3-70b-versatile' },
  gemini:     { baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',   model: 'gemini-2.0-flash' },
  openrouter: { baseURL: 'https://openrouter.ai/api/v1',                               model: 'meta-llama/llama-3.3-70b-instruct:free' },
  together:   { baseURL: 'https://api.together.xyz/v1',                                model: 'meta-llama/Llama-3-70b-chat-hf' },
  mistral:    { baseURL: 'https://api.mistral.ai/v1',                                  model: 'mistral-small-latest' },
  ollama:     { baseURL: 'http://localhost:11434/v1',                                   model: 'llama3.2' },
};

const AI_PROVIDER = process.env.AI_PROVIDER || 'groq';
const _provider = PROVIDERS[AI_PROVIDER] || PROVIDERS.groq;
const AI_BASE_URL = process.env.AI_BASE_URL || _provider.baseURL;
const AI_MODEL = process.env.AI_MODEL || _provider.model;
const AI_API_KEY = process.env.AI_API_KEY || process.env.ANTHROPIC_API_KEY;

// Max total chars per review group — tune this based on your provider's context window.
// Lower = more isolated reviews; higher = more cross-file context per call.
const BUNDLE_THRESHOLD = parseInt(process.env.REVIEW_BUNDLE_THRESHOLD || '10000', 10);

// ── Client factory ─────────────────────────────────────────────────────────────
// Anthropic has its own SDK and message format; everything else is OpenAI-compatible.
const USE_ANTHROPIC_SDK = AI_PROVIDER === 'anthropic' && !process.env.AI_BASE_URL;

function createClient() {
  if (USE_ANTHROPIC_SDK) {
    const Anthropic = require('@anthropic-ai/sdk');
    return new Anthropic({ apiKey: AI_API_KEY });
  }
  const OpenAI = require('openai');
  return new OpenAI({ apiKey: AI_API_KEY, baseURL: AI_BASE_URL });
}

// ── Unified send ───────────────────────────────────────────────────────────────
async function sendMessage(systemPrompt, userPrompt) {
  const client = createClient();

  if (USE_ANTHROPIC_SDK) {
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

function buildUserPrompt(files, prContext) {
  const descriptionBlock = prContext.description
    ? `PR Description:\n${prContext.description.slice(0, 500)}\n`
    : '';

  const fileBlocks = files
    .map(f => `### ${f.filename}\n\`\`\`diff\n${truncateDiff(f.patch)}\n\`\`\``)
    .join('\n\n');

  const fileList = files.map(f => `"${f.filename}"`).join(', ');

  return `PR Context:
- Repository: ${prContext.repo}
- PR Title: ${prContext.title}
${descriptionBlock}
You are reviewing ${files.length} file${files.length > 1 ? 's' : ''} changed in this PR.

${fileBlocks}

Review ALL changed lines (starting with +) across the files above and return a single JSON array of issues.
Each item must have exactly these fields:
{
  "file_path": <one of: ${fileList}>,
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
- Max 8 comments per file, 20 total
- Only flag CHANGED lines (starting with + in the diff)
- You may reference other files in the group when an issue spans multiple files
- Skip trivial whitespace or formatting changes
- Return [] if no real issues found`;
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function shouldReviewFile(filename) {
  const ext = '.' + filename.split('.').pop().toLowerCase();
  return SUPPORTED_EXTENSIONS.has(ext);
}

function truncateDiff(diff, maxChars = MAX_DIFF_CHARS) {
  if (!diff) return '';
  if (diff.length <= maxChars) return diff;
  return diff.substring(0, maxChars) + '\n... [diff truncated for length]';
}

function extractJSON(text) {
  try { return JSON.parse(text.trim()); } catch {}

  const stripped = text
    .replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
  try { return JSON.parse(stripped); } catch {}

  const match = stripped.match(/\[[\s\S]*\]/);
  if (match) { try { return JSON.parse(match[0]); } catch {} }

  return null;
}

// ── Grouping ───────────────────────────────────────────────────────────────────
// Greedy bin-packing: fill a group until it hits BUNDLE_THRESHOLD, then start a new one.
// Files in the same group are reviewed together — the model sees all of them at once.
function groupFiles(files) {
  const groups = [];
  let current = [];
  let currentSize = 0;

  for (const file of files) {
    const size = (file.patch || '').length;

    if (current.length > 0 && currentSize + size > BUNDLE_THRESHOLD) {
      groups.push(current);
      current = [file];
      currentSize = size;
    } else {
      current.push(file);
      currentSize += size;
    }
  }

  if (current.length > 0) groups.push(current);
  return groups;
}

// Returns the set of right-side (new file) line numbers that are actual additions (+).
// Used to filter AI comments that reference lines not in the diff.
function parseAddedLines(patch) {
  const added = new Set();
  if (!patch) return added;
  let newLine = 0;
  for (const line of patch.split('\n')) {
    const hunk = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunk) { newLine = parseInt(hunk[1], 10) - 1; continue; }
    if (line.startsWith('-')) continue;
    newLine++;
    if (line.startsWith('+')) added.add(newLine);
  }
  return added;
}

// ── Core review logic ──────────────────────────────────────────────────────────
async function reviewGroup(files, prContext) {
  const fileNames = files.map(f => f.filename).join(', ');
  const groupSize = files.reduce((sum, f) => sum + (f.patch || '').length, 0);
  console.log(`  🔍 Reviewing ${files.length} file(s) [${groupSize} chars]: ${fileNames}`);

  try {
    const responseText = await sendMessage(
      buildSystemPrompt(),
      buildUserPrompt(files, prContext)
    );

    const comments = extractJSON(responseText);

    if (!Array.isArray(comments)) {
      console.warn(`    ⚠️  Could not parse response for group [${fileNames}] — skipping`);
      return [];
    }

    console.log(`    ✅ ${comments.length} comments`);
    return comments;
  } catch (err) {
    console.error(`    ❌ Error reviewing group [${fileNames}]:`, err.message);
    return [];
  }
}

async function reviewPR(files, prContext) {
  // Filter to reviewable files only
  const reviewable = files.filter(
    f => f.status !== 'removed' && f.patch && shouldReviewFile(f.filename)
  );
  const skipped = files.length - reviewable.length;

  const groups = groupFiles(reviewable);

  console.log(`\n🤖 Starting AI review [${AI_PROVIDER}/${AI_MODEL}] for PR #${prContext.prNumber} in ${prContext.repo}`);
  console.log(`   ${reviewable.length} files → ${groups.length} group(s)${skipped ? ` (${skipped} skipped)` : ''}\n`);

  // Build a map of filename → Set of added line numbers for post-review filtering
  const addedLineMap = {};
  for (const f of reviewable) {
    addedLineMap[f.filename] = parseAddedLines(f.patch);
  }

  const allComments = [];

  for (const group of groups) {
    const comments = await reviewGroup(group, prContext);
    allComments.push(...comments);
    if (groups.length > 1) await new Promise((r) => setTimeout(r, 500));
  }

  // Filter out comments on lines that don't exist in the actual diff additions.
  // This stops the AI from commenting on deleted (-) lines or unchanged context.
  const filtered = allComments.filter(c => {
    if (!c.line_number) return true; // keep null-line comments (general file issues)
    const added = addedLineMap[c.file_path];
    return !added || added.size === 0 || added.has(c.line_number);
  });

  const critical    = filtered.filter((c) => c.severity === 'critical').length;
  const warnings    = filtered.filter((c) => c.severity === 'warning').length;
  const suggestions = filtered.filter((c) => c.severity === 'suggestion').length;

  console.log(`\n📊 Review complete:`);
  console.log(`   Files reviewed: ${reviewable.length}`);
  console.log(`   🔴 Critical: ${critical}`);
  console.log(`   🟡 Warnings: ${warnings}`);
  console.log(`   💡 Suggestions: ${suggestions}`);
  if (allComments.length !== filtered.length)
    console.log(`   ⚠️  Filtered ${allComments.length - filtered.length} comments on non-added lines\n`);

  return { comments: filtered, filesReviewed: reviewable.length, critical, warnings, suggestions };
}

module.exports = { reviewPR };
