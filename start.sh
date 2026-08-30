#!/bin/bash

# Define port: use cloud $PORT if present, otherwise default to 3000 locally
APP_PORT="${PORT:-3000}"

# 1. Start FastAPI backend
echo "Starting FastAPI backend..."
cd ./backend

if [ -d "venv/Scripts" ]; then
    ./venv/Scripts/python -m uvicorn main:app --host 127.0.0.1 --port 8000 &
elif [ -d "venv/bin" ]; then
    ./venv/bin/python -m uvicorn main:app --host 127.0.0.1 --port 8000 &
else
    python -m uvicorn main:app --host 127.0.0.1 --port 8000 &
fi

# 2. Give backend time to initialize
sleep 5

# 3. Start Next.js frontend
echo "Starting Next.js frontend on port $APP_PORT..."
cd ../frontend

# Start the pre-built production server instantly
npm run start -- -H 0.0.0.0 -p "$APP_PORT"