const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.DB_PATH || './data/reviews.db';

// Ensure data directory exists
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
  }
  return db;
}

function initDb() {
  const database = getDb();

  try {
    database.prepare('SELECT 1').get();
  } catch (err) {
    console.error(`❌ Fatal: Database connection failed — ${err.message}`);
    process.exit(1);
  }

  database.exec(`
    CREATE TABLE IF NOT EXISTS pull_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pr_number INTEGER NOT NULL,
      repo_full_name TEXT NOT NULL,
      title TEXT,
      author TEXT,
      status TEXT DEFAULT 'pending',
      files_reviewed INTEGER DEFAULT 0,
      total_comments INTEGER DEFAULT 0,
      critical_count INTEGER DEFAULT 0,
      warning_count INTEGER DEFAULT 0,
      suggestion_count INTEGER DEFAULT 0,
      pr_url TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      reviewed_at DATETIME
    );

    CREATE TABLE IF NOT EXISTS review_comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pr_id INTEGER NOT NULL,
      file_path TEXT NOT NULL,
      line_number INTEGER,
      severity TEXT NOT NULL,
      comment TEXT NOT NULL,
      category TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (pr_id) REFERENCES pull_requests(id)
    );
  `);

  console.log('✅ Database initialized');
}

function savePullRequest(prData) {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO pull_requests (pr_number, repo_full_name, title, author, status, pr_url)
    VALUES (@pr_number, @repo_full_name, @title, @author, @status, @pr_url)
  `);
  const result = stmt.run(prData);
  return result.lastInsertRowid;
}

function updatePullRequest(id, data) {
  const db = getDb();
  const stmt = db.prepare(`
    UPDATE pull_requests SET
      status = @status,
      files_reviewed = @files_reviewed,
      total_comments = @total_comments,
      critical_count = @critical_count,
      warning_count = @warning_count,
      suggestion_count = @suggestion_count,
      reviewed_at = CURRENT_TIMESTAMP
    WHERE id = @id
  `);
  stmt.run({ ...data, id });
}

function saveReviewComments(prId, comments) {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO review_comments (pr_id, file_path, line_number, severity, comment, category)
    VALUES (@pr_id, @file_path, @line_number, @severity, @comment, @category)
  `);

  const insertMany = db.transaction((items) => {
    for (const item of items) {
      stmt.run({ pr_id: prId, ...item });
    }
  });

  insertMany(comments);
}

function getAllReviews() {
  const db = getDb();
  return db.prepare(`
    SELECT * FROM pull_requests ORDER BY created_at DESC LIMIT 50
  `).all();
}

function getReviewById(id) {
  const db = getDb();
  const pr = db.prepare('SELECT * FROM pull_requests WHERE id = ?').get(id);
  if (!pr) return null;
  const comments = db.prepare(
    'SELECT * FROM review_comments WHERE pr_id = ? ORDER BY file_path, line_number'
  ).all(id);
  return { ...pr, comments };
}

function getStats() {
  const db = getDb();
  const total = db.prepare('SELECT COUNT(*) as count FROM pull_requests').get();
  const reviewed = db.prepare(
    "SELECT COUNT(*) as count FROM pull_requests WHERE status = 'reviewed'"
  ).get();
  const severityTotals = db.prepare(`
    SELECT
      SUM(critical_count) as total_critical,
      SUM(warning_count) as total_warnings,
      SUM(suggestion_count) as total_suggestions
    FROM pull_requests
  `).get();
  const recent = db.prepare(`
    SELECT DATE(created_at) as date,
           COUNT(*) as prs,
           SUM(total_comments) as comments
    FROM pull_requests
    WHERE created_at >= DATE('now', '-7 days')
    GROUP BY DATE(created_at)
    ORDER BY date ASC
  `).all();
  const topRepos = db.prepare(`
    SELECT repo_full_name, COUNT(*) as pr_count, SUM(total_comments) as total_issues
    FROM pull_requests
    GROUP BY repo_full_name
    ORDER BY pr_count DESC
    LIMIT 5
  `).all();

  return {
    total_prs: total.count,
    reviewed_prs: reviewed.count,
    ...severityTotals,
    recent_activity: recent,
    top_repos: topRepos,
  };
}

module.exports = {
  initDb,
  savePullRequest,
  updatePullRequest,
  saveReviewComments,
  getAllReviews,
  getReviewById,
  getStats,
};
