# Issue Analytics: backend

FastAPI + SQLAlchemy service. Pulls GitHub issues, cleans them, stores them in SQL, and serves them to the React dashboard.

## Run (Windows PowerShell)
    python -m venv .venv
    .venv\Scripts\Activate.ps1
    pip install -r requirements.txt
    copy .env.example .env
    uvicorn app.main:app --reload

Open http://127.0.0.1:8000/docs, then use POST /sync with header X-API-Key (value from your .env) to load data.

## Endpoints
- GET  /health
- GET  /summary, /timeseries, /labels
- GET  /issues?state=&label=&q=&page=&page_size=
- GET  /activity
- GET  /sync/status
- POST /sync  (requires X-API-Key)

## Design notes
- Re-running a sync never creates duplicates (upsert on GitHub's issue id).
- Each page is committed separately, so a failure keeps earlier pages.
- 5xx and network errors retry with exponential backoff; rate limits stop the run and report a clear message.
- Pull requests, null authors, null bodies and bad rows are handled in ingest.clean().
