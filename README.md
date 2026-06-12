# 🤖 AI Code Review Bot

> Automated pull request reviews powered by **AI** + **GitHub Webhooks**

An AI-powered GitHub bot that automatically reviews pull requests, posts inline comments with severity-ranked feedback, and surfaces review history through a React dashboard.

---

## ✨ Features

- **Automatic PR Reviews** — triggers on every PR open or push via GitHub Webhook
- **Multi-Provider AI** — works with Groq, OpenAI, Anthropic, or any OpenAI-compatible API
- **Inline GitHub Comments** — posts comments directly on the changed lines in the PR
- **Severity Ranking** — 🔴 Critical / 🟡 Warning / 💡 Suggestion
- **Category Tagging** — Security, Performance, Bug, Style, Maintainability, Best Practice
- **React Dashboard** — view all reviews, filter by severity, drill into per-file comments
- **Activity Charts** — 7-day activity + severity distribution (Recharts)
- **SQLite Persistence** — all reviews stored locally, zero external DB needed
- **Docker Ready** — one command to run everything

---

## 🏗️ Architecture

```
┌─────────────────┐     webhook      ┌──────────────────────┐
│   GitHub PR     │ ─────────────▶   │  Node.js Backend     │
│   (opened /     │                  │  Express + SQLite     │
│    pushed)      │                  │                       │
└─────────────────┘                  │  ┌────────────────┐  │
                                     │  │   AI Provider  │  │
┌─────────────────┐  REST API        │  │ (diff review)  │  │
│  React Dashboard│ ◀─────────────   │  └────────────────┘  │
│  (port 3000)    │                  │                       │
└─────────────────┘                  │  ┌────────────────┐  │
                                     │  │  GitHub API    │  │
                                     │  │ (post review)  │  │
                                     │  └────────────────┘  │
                                     └──────────────────────┘
```

---

## 🚀 Quick Start

### 1. Clone & Install

```bash
git clone https://github.com/asfar95/ai-code-review-bot.git
cd ai-code-review-bot

# Install backend deps
cd backend && npm install

# Install frontend deps
cd ../frontend && npm install
```

### 2. Configure Environment

```bash
cd backend
cp .env.example .env
```

Edit `.env` with your credentials:

```env
GITHUB_TOKEN=ghp_your_token_here          # GitHub Personal Access Token (repo scope)
GITHUB_WEBHOOK_SECRET=your_secret_here    # Any random string

AI_PROVIDER=groq                          # groq | openai | anthropic
AI_MODEL=llama-3.3-70b-versatile          # model name for the chosen provider
AI_API_KEY=your_api_key_here              # API key for the chosen provider
```

### 3. Expose Localhost (for GitHub Webhook)

Use [ngrok](https://ngrok.com/) or [localtunnel](https://github.com/localtunnel/localtunnel) to expose your local server:

```bash
# ngrok (requires free account)
ngrok http 3001

# localtunnel (no account needed)
npx localtunnel --port 3001
```

### 4. Create GitHub Webhook

In your GitHub repo: **Settings → Webhooks → Add webhook**

| Field | Value |
|-------|-------|
| Payload URL | `https://your-tunnel-url/webhook` |
| Content type | `application/json` |
| Secret | (same as `GITHUB_WEBHOOK_SECRET`) |
| Events | `Pull requests` |

### 5. Run

```bash
# Terminal 1 — Backend
cd backend && npm run dev

# Terminal 2 — Frontend
cd frontend && npm start
```

Open **http://localhost:3000** for the dashboard.

---

## 🐳 Docker

```bash
cp backend/.env.example backend/.env
# fill in your credentials in backend/.env

docker-compose up --build
```

Dashboard → http://localhost:3000  
API → http://localhost:3001

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
│   │       ├── aiService.js          # AI provider integration (Groq, OpenAI, Anthropic)
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
├── docker-compose.yml
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
| Deploy | Docker, docker-compose |

---

## 📄 License

MIT — built by [Asfar Ali](https://linkedin.com/in/asfar-ali-48b612138)
