require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { initDb } = require('./db');
const webhookRouter = require('./routes/webhook');
const reviewsRouter = require('./routes/reviews');

const REQUIRED_ENV = ['GITHUB_TOKEN', 'AI_API_KEY', 'GITHUB_WEBHOOK_SECRET'];
for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    console.error(`❌ Fatal: ${key} is not set. Add it to .env and restart.`);
    process.exit(1);
  }
}

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
// express.json() must NOT apply to /webhook — the route reads raw bytes manually
// for HMAC signature verification. Applying it globally would consume the stream.
app.use('/api', express.json());
app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:3000' }));

// Routes
app.use('/webhook', webhookRouter);
app.use('/api/reviews', reviewsRouter);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Init DB then start server
initDb();
const server = app.listen(PORT, () => {
  console.log(`\n🤖 AI Code Review Bot running on http://localhost:${PORT}`);
  console.log(`📡 Webhook endpoint: http://localhost:${PORT}/webhook`);
  console.log(`📊 Reviews API: http://localhost:${PORT}/api/reviews\n`);
});

function shutdown(signal) {
  console.log(`\n⏳ ${signal} received — shutting down gracefully`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 30_000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));
