from datetime import datetime, timezone

from sqlalchemy import BigInteger, Column, ForeignKey, String, Table, Text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


def utcnow() -> datetime:
    """Naive UTC time. All timestamps are stored as UTC."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


class Base(DeclarativeBase):
    pass


issue_labels = Table(
    "issue_labels",
    Base.metadata,
    Column("issue_id", ForeignKey("issues.id"), primary_key=True),
    Column("label_id", ForeignKey("labels.id"), primary_key=True),
)


class Label(Base):
    __tablename__ = "labels"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100), unique=True, index=True)


class Issue(Base):
    __tablename__ = "issues"
    # GitHub's own id. It exceeds 32 bits, so BigInteger is required on Postgres.
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=False)
    number: Mapped[int] = mapped_column(index=True)
    title: Mapped[str] = mapped_column(String(500))
    state: Mapped[str] = mapped_column(String(10), index=True)
    author: Mapped[str] = mapped_column(String(100), default="unknown")
    body: Mapped[str | None] = mapped_column(Text, nullable=True)
    comments_count: Mapped[int] = mapped_column(default=0)
    created_at: Mapped[datetime] = mapped_column(index=True)
    closed_at: Mapped[datetime | None] = mapped_column(nullable=True)
    labels: Mapped[list[Label]] = relationship(secondary=issue_labels, lazy="selectin")


class SyncRun(Base):
    __tablename__ = "sync_runs"
    id: Mapped[int] = mapped_column(primary_key=True)
    started_at: Mapped[datetime]
    finished_at: Mapped[datetime | None] = mapped_column(nullable=True)
    status: Mapped[str] = mapped_column(String(20))  # running, success, partial, failed
    records_fetched: Mapped[int] = mapped_column(default=0)
    errors: Mapped[int] = mapped_column(default=0)
    message: Mapped[str | None] = mapped_column(Text, nullable=True)
