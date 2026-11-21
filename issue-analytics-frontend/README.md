# Issue Analytics: frontend

React + Vite dashboard for the issue analytics service.

## Run
    npm install
    npm run dev

It opens with built-in demo data (src/api.js), so you can work on the UI before the backend exists.

## Connect the real backend later
1. Copy `.env.example` to `.env`
2. Set `VITE_API_URL=http://localhost:8000`
3. Add CORS for http://localhost:5173 in FastAPI

## API contract the UI expects
- GET  /stats/summary    -> { total, open, closed, avg_days_to_close }
- GET  /stats/timeseries -> [{ week, opened, closed }]
- GET  /stats/labels     -> [{ label, count }]
- GET  /issues?state=&label=&page=&page_size=10 -> { total, page_size, items: [{ number, title, state, author, labels[], created_at, closed_at }] }
- GET  /sync/status      -> { status, finished_at, records_fetched, errors }
- POST /sync (header X-API-Key) -> same shape as /sync/status
