#!/bin/bash

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"
LOG_DIR="/tmp/ai-bot"
mkdir -p "$LOG_DIR"

# ── Cleanup on exit ────────────────────────────────────────────────────────────
cleanup() {
  echo ""
  echo "🛑 Shutting down..."
  kill "$BACKEND_PID" "$FRONTEND_PID" "$NGROK_PID" 2>/dev/null
  exit 0
}
trap cleanup SIGINT SIGTERM

# ── Start backend ──────────────────────────────────────────────────────────────
echo "🚀 Starting backend..."
cd "$BACKEND_DIR"
node src/index.js > "$LOG_DIR/backend.log" 2>&1 &
BACKEND_PID=$!

sleep 2

if ! kill -0 "$BACKEND_PID" 2>/dev/null; then
  echo "❌ Backend failed to start. Check $LOG_DIR/backend.log"
  cat "$LOG_DIR/backend.log"
  exit 1
fi
echo "✅ Backend running  (PID $BACKEND_PID) → http://localhost:3001"

# ── Start frontend ─────────────────────────────────────────────────────────────
echo "🎨 Starting frontend..."
cd "$FRONTEND_DIR"
BROWSER=none npm start > "$LOG_DIR/frontend.log" 2>&1 &
FRONTEND_PID=$!

sleep 5

if ! kill -0 "$FRONTEND_PID" 2>/dev/null; then
  echo "❌ Frontend failed to start. Check $LOG_DIR/frontend.log"
  cat "$LOG_DIR/frontend.log"
  cleanup
fi
echo "✅ Frontend running (PID $FRONTEND_PID) → http://localhost:3000"

# ── Start ngrok ────────────────────────────────────────────────────────────────
echo "🌐 Starting ngrok tunnel..."
ngrok http 3001 --log=stdout > "$LOG_DIR/ngrok.log" 2>&1 &
NGROK_PID=$!

sleep 3

PUBLIC_URL=$(curl -s http://localhost:4040/api/tunnels \
  | node -e "process.stdin.resume();let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{const t=JSON.parse(d).tunnels.find(t=>t.proto==='https');console.log(t?t.public_url:'NOT_FOUND');}catch{console.log('NOT_FOUND');}})")

if [ "$PUBLIC_URL" = "NOT_FOUND" ] || [ -z "$PUBLIC_URL" ]; then
  echo "❌ ngrok failed to start. Check $LOG_DIR/ngrok.log"
  cat "$LOG_DIR/ngrok.log"
  cleanup
fi

echo ""
echo "══════════════════════════════════════════════════"
echo "  🤖 AI Code Review Bot is live!"
echo ""
echo "  Dashboard   : http://localhost:3000"
echo "  Webhook URL : $PUBLIC_URL/webhook"
echo "  Reviews API : http://localhost:3001/api/reviews"
echo ""
echo "  Logs → $LOG_DIR/"
echo "══════════════════════════════════════════════════"
echo ""
echo "Press Ctrl+C to stop all services."

wait
