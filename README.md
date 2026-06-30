# NLPSearch

AI-powered PostgreSQL natural language search. Ask your database questions in plain English.

## Quick Start

### Backend
```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env  # Edit with your credentials
uvicorn app.main:app --reload --port 8000
```

### Frontend
```bash
cd frontend
npm install
cp .env.local.example .env.local
npm run dev
```

## Architecture

- **Frontend**: Next.js 15 + TypeScript + Tailwind CSS
- **Backend**: FastAPI + SQLAlchemy + asyncpg
- **LLM**: Google Gemini 2.5 Flash
- **Embeddings**: Google text-embedding-004 + pgvector
- **Security**: Fernet encryption, SQL validation, rate limiting
