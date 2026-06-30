#!/bin/bash

# NLPSearch On-Premise Setup Script
# Configures the Python backend environment and Node.js frontend dependencies.

set -e

echo "=== Starting NLPSearch Enterprise Setup ==="

# 1. Verify Prerequisites
echo "Checking dependencies..."
if ! command -v python3 &> /dev/null; then
    echo "ERROR: python3 is not installed. Please install Python 3.10+ and try again."
    exit 1
fi

if ! command -v node &> /dev/null; then
    echo "ERROR: node (Node.js) is not installed. Please install Node.js 18+ and try again."
    exit 1
fi

if ! command -v npm &> /dev/null; then
    echo "ERROR: npm is not installed. Please install npm and try again."
    exit 1
fi

# 2. Setup Backend environment
echo "Setting up Python virtual environment..."
cd backend
if [ ! -d ".venv" ] && [ ! -d "venv" ]; then
    python3 -m venv .venv
fi

# Determine virtual env activation script
if [ -d ".venv" ]; then
    VENV_ACTIVATE=".venv/bin/activate"
else
    VENV_ACTIVATE="venv/bin/activate"
fi

source "$VENV_ACTIVATE"
echo "Installing backend dependencies..."
pip install --upgrade pip
pip install -r requirements.txt
deactivate
cd ..

# 3. Create Backend .env Configuration if missing
if [ ! -f "backend/.env" ]; then
    echo "Generating backend environment configuration (.env)..."
    FERNET_KEY=$(python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())")
    
    cat <<EOT > backend/.env
# ── Internal PostgreSQL (stores metadata, embeddings, logs) ──
DATABASE_URL=postgresql+asyncpg://nlpsearch_user:your_password@localhost:5432/nlpsearch_internal

# ── Google Gemini & Groq ──
GEMINI_API_KEY=your_gemini_api_key_here
GROQ_API_KEY=your_groq_api_key_here

# ── Security ──
FERNET_KEY=$FERNET_KEY
ADMIN_API_KEY=admin_secret_token

# ── App Config ──
MAX_ROWS=100
QUERY_TIMEOUT_SECONDS=10
RATE_LIMIT=60/minute
ENVIRONMENT=production

# ── CORS ──
ALLOWED_ORIGINS=http://localhost:3000
EOT
    echo "Created backend/.env with fresh Fernet Key."
fi

# 4. Setup Frontend dependencies
echo "Setting up Next.js frontend dependencies..."
cd frontend
npm install --legacy-peer-deps
cd ..

# 5. Create Frontend config if missing
if [ ! -f "frontend/.env.local" ]; then
    echo "Generating frontend environment configuration (.env.local)..."
    cat <<EOT > frontend/.env.local
NEXT_PUBLIC_API_URL=http://localhost:8000
EOT
    echo "Created frontend/.env.local."
fi

echo "=== Setup Completed Successfully! ==="
echo "You can now run the application by executing: ./run.sh"
