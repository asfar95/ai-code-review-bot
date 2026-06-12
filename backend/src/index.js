require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { initDb } = require('./db');
const webhookRouter = require('./routes/webhook');
const reviewsRouter = require('./routes/reviews');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
// Raw body needed for GitHub webhook signature verification
app.use('/webhook', express.raw({ type: 'application/json' }));
app.use(express.json());
app.use(cors({ origin: 'http://localhost:3000' }));

// Routes
app.use('/webhook', webhookRouter);
app.use('/api/reviews', reviewsRouter);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Init DB then start server
initDb();
app.listen(PORT, () => {
  console.log(`\n🤖 AI Code Review Bot running on http://localhost:${PORT}`);
  console.log(`📡 Webhook endpoint: http://localhost:${PORT}/webhook`);
  console.log(`📊 Reviews API: http://localhost:${PORT}/api/reviews\n`);
});
