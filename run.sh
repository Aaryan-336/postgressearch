#!/bin/bash

# NLPSearch On-Premise Runner Script
# Launches both Next.js frontend and FastAPI backend concurrently and manages lifecycles.

# Handle exit cleanup
cleanup() {
    echo ""
    echo "Stopping NLPSearch services..."
    if [ ! -z "$BACKEND_PID" ]; then
        kill "$BACKEND_PID" 2>/dev/null || true
    fi
    if [ ! -z "$FRONTEND_PID" ]; then
        kill "$FRONTEND_PID" 2>/dev/null || true
    fi
    echo "Services stopped successfully."
    exit 0
}

# Trap Ctrl+C (SIGINT) and exit signals
trap cleanup SIGINT SIGTERM EXIT

echo "=== Starting NLPSearch Services ==="

# 1. Start Backend
cd backend
if [ -d ".venv" ]; then
    VENV_PYTHON=".venv/bin/python"
else
    VENV_PYTHON="venv/bin/python"
fi

echo "Starting FastAPI Backend on http://localhost:8000..."
$VENV_PYTHON -m uvicorn app.main:app --host 0.0.0.0 --port 8000 &
BACKEND_PID=$!
cd ..

# Wait briefly for backend to check ports
sleep 2

# 2. Start Frontend
echo "Starting Next.js Frontend on http://localhost:3000..."
cd frontend
npm run start &
FRONTEND_PID=$!
cd ..

echo "=== Both services running. Press Ctrl+C to stop them. ==="

# Keep script running
while true; do
    sleep 1
done
