# 🤖 AI Code Review Bot

![Node.js](https://img.shields.io/badge/Node.js-20+-339933?logo=node.js&logoColor=white)
![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white)
![License](https://img.shields.io/badge/license-MIT-blue)
![Docker](https://img.shields.io/badge/Docker-ready-2496ED?logo=docker&logoColor=white)

> Automated pull request reviews powered by **AI** + **GitHub Webhooks**

An AI-powered GitHub bot that automatically reviews pull requests, posts inline comments with severity-ranked feedback, and surfaces review history through a React dashboard. Supports Groq, OpenAI, and Anthropic out of the box.

---

## 📸 Screenshots

> **Bot commenting inline on a GitHub PR:**
> *(Drop a screenshot of the bot's inline PR comments here)*

> **React dashboard — review history & severity breakdown:**
> *(Drop a screenshot of the dashboard here)*

---

## ✨ Features

- **Automatic PR Reviews** — triggers on every PR open or push via GitHub Webhook
- **Cross-File Analysis** — groups related files into a single AI call so the model can catch bugs that span multiple files
- **Multi-Provider AI** — works with Groq (free), OpenAI, Anthropic, or any OpenAI-compatible API
- **Inline GitHub Comments** — posts comments directly on the changed lines in the PR
- **Severity Ranking** — 🔴 Critical / 🟡 Warning / 💡 Suggestion
- **Category Tagging** — Security, Performance, Bug, Style, Maintainability, Best Practice
- **MCP Server** — expose the bot as a tool inside Claude Code
- **React Dashboard** — view all reviews, filter by severity, drill into per-file comments
- **Activity Charts** — 7-day activity + severity distribution (Recharts)
- **SQLite Persistence** — all reviews stored locally, zero external DB needed
- **Docker Ready** — one command to run everything

---

## 🏗️ Architecture

```
┌─────────────────┐     webhook      ┌──────────────────────────────┐
│   GitHub PR     │ ─────────────▶   │  Node.js Backend             │
│   (opened /     │                  │  Express + SQLite             │
│    pushed)      │                  │                               │
└─────────────────┘                  │  ┌────────────────────────┐  │
                                     │  │  AI Provider           │  │
┌─────────────────┐  REST API        │  │  Groq/OpenAI/Anthropic │  │
│  React Dashboard│ ◀─────────────   │  │  (cross-file review)   │  │
│  (port 3000)    │                  │  └────────────────────────┘  │
└─────────────────┘                  │                               │
                                     │  ┌────────────────────────┐  │
┌─────────────────┐  MCP tools       │  │  GitHub API            │  │
│  Claude Code    │ ◀─────────────   │  │  (post inline review)  │  │
│  (AI assistant) │                  │  └────────────────────────┘  │
└─────────────────┘                  └──────────────────────────────┘
```

---

## 🚀 Quick Start

### 1. Clone & Install

```bash
git clone https://github.com/asfar95/ai-code-review-bot.git
cd ai-code-review-bot

cd backend && npm install
cd ../frontend && npm install
cd ../mcp && npm install
```

### 2. Configure Environment

```bash
cd backend
cp .env.example .env
```

Edit `.env`:

```env
GITHUB_TOKEN=ghp_your_token_here          # GitHub Personal Access Token (repo scope)
GITHUB_WEBHOOK_SECRET=your_secret_here    # Any random string — must match GitHub webhook config

AI_PROVIDER=groq                          # groq | openai | anthropic
AI_MODEL=llama-3.3-70b-versatile          # model name for the chosen provider
AI_API_KEY=your_api_key_here              # API key for the chosen provider

REVIEW_BUNDLE_THRESHOLD=10000             # chars per review group (tune for your provider's context window)
```

### 3. Run Everything (one command)

```bash
./start.sh
```

This starts the backend, frontend, and an ngrok tunnel automatically. The output prints your webhook URL.

<details>
<summary>Manual startup (alternative)</summary>

```bash
# Terminal 1 — Backend
cd backend && npm run dev

# Terminal 2 — Frontend
cd frontend && npm start

# Terminal 3 — Tunnel
ngrok http 3001
```
</details>

### 4. Add Webhook to GitHub

In your repo: **Settings → Webhooks → Add webhook**

| Field | Value |
|-------|-------|
| Payload URL | `https://your-ngrok-url/webhook` |
| Content type | `application/json` |
| Secret | (same as `GITHUB_WEBHOOK_SECRET`) |
| Events | `Pull requests` |

Open a PR — the bot reviews it and posts inline comments automatically.

---

## 🐳 Docker

```bash
cp backend/.env.example backend/.env
# fill in backend/.env

docker-compose up --build
```

Dashboard → http://localhost:3000  
API → http://localhost:3001

---

## 🔌 MCP Server (Claude Code Integration)

The `mcp/` package exposes the bot as tools inside Claude Code — trigger reviews without opening a PR.

### Available Tools

| Tool | Description |
|------|-------------|
| `review_pr` | Review any GitHub PR by owner / repo / number |
| `review_code` | Review a raw code snippet |
| `get_review_history` | List past reviews from the local DB |
| `get_review_stats` | Aggregate stats — totals, severity breakdown, 7-day activity |

### Setup

```bash
cd mcp && npm install
```

Add to `~/.claude/settings.json`:

```json
{
  "mcpServers": {
    "ai-code-review": {
      "command": "node",
      "args": ["/absolute/path/to/ai-code-review-bot/mcp/src/index.js"]
    }
  }
}
```

Restart Claude Code — the tools appear automatically.

---

## 📁 Project Structure

```
ai-code-review-bot/
├── backend/
│   ├── src/
│   │   ├── index.js                  # Express app entry
│   │   ├── db.js                     # SQLite database layer
│   │   ├── routes/
│   │   │   ├── webhook.js            # GitHub webhook handler
│   │   │   └── reviews.js            # REST API for dashboard
│   │   └── services/
│   │       ├── aiService.js          # AI provider integration + cross-file grouping
│   │       └── githubService.js      # GitHub API + webhook verification
│   ├── Dockerfile
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Dashboard.js          # Stats + charts overview
│   │   │   ├── Reviews.js            # PR review list with filters
│   │   │   └── ReviewDetail.js       # Per-PR comments by file
│   │   ├── hooks/
│   │   │   └── useApi.js             # API data fetching hooks
│   │   └── App.js                    # Router + sidebar layout
│   └── package.json
├── mcp/
│   ├── src/
│   │   └── index.js                  # MCP server — 4 tools for Claude Code
│   └── package.json
├── docker-compose.yml
├── start.sh                          # One-command launcher (backend + frontend + ngrok)
└── README.md
```

---

## 🔑 Getting API Keys

### GitHub Personal Access Token
1. GitHub → Settings → Developer Settings → Personal Access Tokens
2. Permissions needed: **repo** scope

### AI Provider API Key

| Provider | Free Tier | Get Key |
|----------|-----------|---------|
| Groq | ✅ Yes | console.groq.com |
| OpenAI | ❌ No | platform.openai.com |
| Anthropic | Limited | console.anthropic.com |

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Node.js, Express |
| AI | Groq / OpenAI / Anthropic (configurable) |
| GitHub | Octokit REST, Webhooks |
| Database | SQLite (better-sqlite3) |
| Frontend | React 18, React Router |
| Charts | Recharts |
| MCP | @modelcontextprotocol/sdk |
| Deploy | Docker, docker-compose |

---

## 📄 License

MIT — built by [Asfar Ali](https://linkedin.com/in/asfar-ali-48b612138)
