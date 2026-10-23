"""SQLite access. The schema is created automatically on startup."""
import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path

SCHEMA = """
CREATE TABLE IF NOT EXISTS devices (
    id           TEXT PRIMARY KEY,
    fcm_token    TEXT NOT NULL UNIQUE,
    platform     TEXT NOT NULL CHECK (platform IN ('android')),
    device_name  TEXT,
    created_at   TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    is_active    INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1))
);

CREATE TABLE IF NOT EXISTS notifications (
    id                  TEXT PRIMARY KEY,
    device_id           TEXT NOT NULL REFERENCES devices(id),
    title               TEXT NOT NULL,
    body                TEXT NOT NULL,
    attempted_at        TEXT NOT NULL,
    status              TEXT NOT NULL CHECK (status IN ('accepted', 'failed', 'invalid_token')),
    firebase_message_id TEXT,
    error_summary       TEXT
);

CREATE INDEX IF NOT EXISTS idx_notifications_attempted_at ON notifications(attempted_at DESC);
"""


class Database:
    def __init__(self, path: Path | str):
        self.path = str(path)
        if self.path != ":memory:":
            Path(self.path).parent.mkdir(parents=True, exist_ok=True)
        # An in-memory database vanishes when its connection closes, so keep
        # one shared connection in that case (used by tests).
        self._shared: sqlite3.Connection | None = None
        if self.path == ":memory:":
            self._shared = self._open()
        self.init_schema()

    def _open(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.path, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        return conn

    @contextmanager
    def connect(self) -> Iterator[sqlite3.Connection]:
        """Yield a connection; commit on success, roll back on any error."""
        conn = self._shared or self._open()
        try:
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            if self._shared is None:
                conn.close()

    def init_schema(self) -> None:
        with self.connect() as conn:
            conn.executescript(SCHEMA)
