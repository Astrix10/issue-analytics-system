"""Pulls issues from GitHub and upserts them. Safe to re-run: no duplicates."""
from datetime import datetime, timezone

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session
from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential

from . import config
from .models import Issue, Label, SyncRun, utcnow


class RateLimited(Exception):
    """GitHub says we are out of requests. Retrying now would not help."""


class TransientError(Exception):
    """Network trouble or a 5xx. Worth retrying with backoff."""


def parse_ts(value: str | None) -> datetime | None:
    if not value:
        return None
    return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(timezone.utc).replace(tzinfo=None)


@retry(
    retry=retry_if_exception_type(TransientError),
    stop=stop_after_attempt(4),
    wait=wait_exponential(multiplier=1, min=1, max=10),
    reraise=True,
)
def fetch_page(client: httpx.Client, url: str, params: dict | None = None) -> httpx.Response:
    try:
        res = client.get(url, params=params)
    except httpx.TransportError as exc:
        raise TransientError(str(exc)) from exc
    if res.status_code == 429 or (res.status_code == 403 and res.headers.get("x-ratelimit-remaining") == "0"):
        reset = int(res.headers.get("x-ratelimit-reset", "0"))
        when = datetime.fromtimestamp(reset, timezone.utc).strftime("%H:%M UTC") if reset else "later"
        raise RateLimited(f"GitHub rate limit reached. Try again after {when}.")
    if res.status_code >= 500:
        raise TransientError(f"GitHub returned {res.status_code}")
    res.raise_for_status()
    return res


def clean(item: dict) -> dict:
    """Turn one messy GitHub issue into the shape we store. Raises on unusable rows."""
    names = [l["name"] if isinstance(l, dict) else str(l) for l in (item.get("labels") or [])]
    return {
        "id": item["id"],
        "number": item["number"],
        "title": (item.get("title") or "(no title)").strip()[:500],
        "state": item.get("state") or "open",
        "author": (item.get("user") or {}).get("login") or "unknown",  # deleted users come back as null
        "body": item.get("body"),  # often null
        "comments_count": item.get("comments") or 0,
        "created_at": parse_ts(item["created_at"]),
        "closed_at": parse_ts(item.get("closed_at")),
        "labels": list(dict.fromkeys(names)),
    }


def get_label(db: Session, name: str) -> Label:
    label = db.scalar(select(Label).where(Label.name == name))
    if label is None:
        label = Label(name=name)
        db.add(label)
        db.flush()
    return label


def upsert(db: Session, data: dict) -> None:
    issue = db.get(Issue, data["id"]) or Issue(id=data["id"])
    for key in ("number", "title", "state", "author", "body", "comments_count", "created_at", "closed_at"):
        setattr(issue, key, data[key])
    issue.labels = [get_label(db, n) for n in data["labels"]]
    db.add(issue)


def run_sync(db: Session, transport: httpx.BaseTransport | None = None) -> SyncRun:
    run = SyncRun(started_at=utcnow(), status="running", records_fetched=0, errors=0)
    db.add(run)
    db.commit()

    headers = {"Accept": "application/vnd.github+json", "User-Agent": "issue-analytics"}
    if config.GITHUB_TOKEN:
        headers["Authorization"] = f"Bearer {config.GITHUB_TOKEN}"

    url: str | None = f"https://api.github.com/repos/{config.GITHUB_REPO}/issues"
    params: dict | None = {"state": "all", "per_page": 100, "sort": "created", "direction": "desc"}
    pages = 0
    status, message = "success", None

    try:
        with httpx.Client(headers=headers, timeout=20, transport=transport) as client:
            while url and pages < config.MAX_PAGES:
                res = fetch_page(client, url, params)
                params = None  # the "next" link already carries the query string
                for item in res.json():
                    if "pull_request" in item:  # this endpoint mixes pull requests in
                        continue
                    try:
                        data = clean(item)
                    except (KeyError, ValueError, TypeError):
                        run.errors += 1
                        continue
                    upsert(db, data)
                    run.records_fetched += 1
                db.commit()  # one page at a time, so a later failure keeps earlier pages
                pages += 1
                url = res.links.get("next", {}).get("url")
    except RateLimited as exc:
        db.rollback()
        status, message = ("partial" if run.records_fetched else "failed"), str(exc)
    except (httpx.HTTPError, TransientError) as exc:
        db.rollback()
        status, message = "failed", f"GitHub request failed: {exc}"

    run.status, run.message, run.finished_at = status, message, utcnow()
    db.commit()
    return run
