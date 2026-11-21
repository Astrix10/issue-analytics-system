import secrets
from collections import Counter
from contextlib import asynccontextmanager
from datetime import timedelta
from typing import Annotated

from fastapi import Depends, FastAPI, Header, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from . import config
from .db import engine, get_db
from .ingest import run_sync
from .models import Base, Issue, Label, SyncRun, issue_labels, utcnow
from .schemas import ActivityItem, IssueOut, IssuesPage, LabelCount, SeriesPoint, Summary, SyncStatus


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(engine)
    yield


app = FastAPI(title="Issue Analytics API", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=config.ALLOWED_ORIGINS,
    allow_methods=["GET", "POST"],
    allow_headers=["X-API-Key", "Content-Type"],
)

DB = Annotated[Session, Depends(get_db)]
WEEKS = 18
DAY = 86400


def require_key(x_api_key: Annotated[str | None, Header()] = None) -> None:
    if not x_api_key or not secrets.compare_digest(x_api_key.encode(), config.API_KEY.encode()):
        raise HTTPException(status_code=401, detail="Invalid or missing API key")


def to_issue_out(i: Issue) -> dict:
    return {
        "number": i.number, "title": i.title, "state": i.state, "author": i.author,
        "labels": [l.name for l in i.labels], "created_at": i.created_at, "closed_at": i.closed_at,
    }


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/summary", response_model=Summary)
def summary(db: DB):
    total = db.scalar(select(func.count(Issue.id))) or 0
    closed = db.scalar(select(func.count(Issue.id)).where(Issue.state == "closed")) or 0
    spans = db.execute(select(Issue.created_at, Issue.closed_at).where(Issue.closed_at.is_not(None))).all()
    avg = sum((c - o).total_seconds() for o, c in spans) / len(spans) / DAY if spans else 0
    return {"total": total, "open": total - closed, "closed": closed, "avg_days_to_close": round(avg, 1)}


@app.get("/timeseries", response_model=list[SeriesPoint])
def timeseries(db: DB):
    now = utcnow()
    week_of = lambda dt: int((now - dt).total_seconds() // (7 * DAY))
    opened, closed = Counter(), Counter()
    for created, closed_at in db.execute(select(Issue.created_at, Issue.closed_at)).all():
        if 0 <= week_of(created) < WEEKS:
            opened[week_of(created)] += 1
        if closed_at and 0 <= week_of(closed_at) < WEEKS:
            closed[week_of(closed_at)] += 1
    points = []
    for w in range(WEEKS - 1, -1, -1):
        d = now - timedelta(weeks=w)
        points.append({"week": f"{d.day} {d.strftime('%b')}", "opened": opened[w], "closed": closed[w]})
    return points


@app.get("/labels", response_model=list[LabelCount])
def labels(db: DB):
    n = func.count(issue_labels.c.issue_id)
    rows = db.execute(
        select(Label.name, n).select_from(Label)
        .join(issue_labels, issue_labels.c.label_id == Label.id)
        .group_by(Label.name).order_by(n.desc(), Label.name)
    ).all()
    return [{"label": name, "count": count} for name, count in rows]


@app.get("/issues", response_model=IssuesPage)
def list_issues(
    db: DB,
    state: Annotated[str | None, Query(pattern="^(open|closed)$")] = None,
    label: str | None = None,
    q: str | None = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 10,
):
    stmt = select(Issue)
    if state:
        stmt = stmt.where(Issue.state == state)
    if label:
        stmt = stmt.where(Issue.labels.any(Label.name == label))
    if q and q.strip():
        term = q.strip()
        cond = Issue.title.icontains(term, autoescape=True)
        if term.isdigit():
            cond = or_(cond, Issue.number == int(term))
        stmt = stmt.where(cond)
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = db.scalars(
        stmt.order_by(Issue.created_at.desc(), Issue.id.desc()).offset((page - 1) * page_size).limit(page_size)
    ).all()
    return {"total": total, "page_size": page_size, "items": [to_issue_out(i) for i in rows]}


@app.get("/activity", response_model=list[ActivityItem])
def activity(db: DB):
    events = []
    for i in db.scalars(select(Issue).order_by(Issue.created_at.desc()).limit(5)):
        events.append({"text": f"#{i.number} opened by {i.author}", "at": i.created_at, "tone": "open"})
    for i in db.scalars(select(Issue).where(Issue.closed_at.is_not(None)).order_by(Issue.closed_at.desc()).limit(5)):
        events.append({"text": f"#{i.number} closed", "at": i.closed_at, "tone": "closed"})
    last = latest_finished_run(db)
    if last:
        tone = "closed" if last.status == "success" else "open"
        events.append({"text": f"Sync {last.status}: {last.records_fetched} records", "at": last.finished_at, "tone": tone})
    return sorted(events, key=lambda e: e["at"], reverse=True)[:5]


def latest_finished_run(db: Session) -> SyncRun | None:
    return db.scalar(select(SyncRun).where(SyncRun.finished_at.is_not(None)).order_by(SyncRun.finished_at.desc()).limit(1))


def status_out(run: SyncRun | None) -> dict:
    if run is None:
        return {"status": "never", "finished_at": None, "records_fetched": 0, "errors": 0, "message": None}
    return {"status": run.status, "finished_at": run.finished_at, "records_fetched": run.records_fetched,
            "errors": run.errors, "message": run.message}


@app.get("/sync/status", response_model=SyncStatus)
def sync_status(db: DB):
    return status_out(latest_finished_run(db))


@app.post("/sync", response_model=SyncStatus, dependencies=[Depends(require_key)])
def start_sync(db: DB):
    recent = utcnow() - timedelta(minutes=10)
    busy = db.scalar(select(SyncRun.id).where(SyncRun.status == "running", SyncRun.started_at > recent).limit(1))
    if busy:
        raise HTTPException(status_code=409, detail="A sync is already running")
    return status_out(run_sync(db))
