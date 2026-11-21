import os

from dotenv import load_dotenv

load_dotenv()

GITHUB_REPO = os.getenv("GITHUB_REPO", "fastapi/fastapi")
GITHUB_TOKEN = os.getenv("GITHUB_TOKEN") or None
API_KEY = os.getenv("API_KEY", "dev-key")
MAX_PAGES = int(os.getenv("MAX_PAGES", "5"))
ALLOWED_ORIGINS = [o.strip() for o in os.getenv("ALLOWED_ORIGINS", "http://localhost:5173").split(",") if o.strip()]


def _database_url() -> str:
    url = os.getenv("DATABASE_URL", "sqlite:///./issues.db")
    # Hosts often hand out postgres:// URLs; SQLAlchemy needs a driver name.
    for prefix in ("postgres://", "postgresql://"):
        if url.startswith(prefix):
            return "postgresql+psycopg://" + url[len(prefix):]
    return url


DATABASE_URL = _database_url()
