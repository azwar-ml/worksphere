#!/bin/bash
# 1. Start the Python FastAPI backend in the background
echo "Starting FastAPI backend..."
cd /app/backend
# Notice we removed --reload for production
uvicorn main:app --host 127.0.0.1 --port 8000 &

# 2. Wait a few seconds for the backend to start
sleep 5

# 3. Start the Next.js frontend in the foreground
echo "Starting Next.js frontend..."
cd /app/frontend
# Use production start, binding to Render's port
npm run start -- -p $PORT