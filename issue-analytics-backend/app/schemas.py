from datetime import datetime, timezone
from typing import Annotated

from pydantic import BaseModel, BeforeValidator


def _as_utc(v):
    # Stored as naive UTC; mark it as UTC so JSON ends in "Z" and browsers parse it correctly.
    if isinstance(v, datetime) and v.tzinfo is None:
        return v.replace(tzinfo=timezone.utc)
    return v


UtcDatetime = Annotated[datetime, BeforeValidator(_as_utc)]


class Summary(BaseModel):
    total: int
    open: int
    closed: int
    avg_days_to_close: float


class SeriesPoint(BaseModel):
    week: str
    opened: int
    closed: int


class LabelCount(BaseModel):
    label: str
    count: int


class IssueOut(BaseModel):
    number: int
    title: str
    state: str
    author: str
    labels: list[str]
    created_at: UtcDatetime
    closed_at: UtcDatetime | None


class IssuesPage(BaseModel):
    total: int
    page_size: int
    items: list[IssueOut]


class ActivityItem(BaseModel):
    text: str
    at: UtcDatetime
    tone: str


class SyncStatus(BaseModel):
    status: str
    finished_at: UtcDatetime | None
    records_fetched: int
    errors: int
    message: str | None = None
